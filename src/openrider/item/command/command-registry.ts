import { Vector } from 'canvade';
import type { PhysicsCell } from '../../grid/cell/physics-cell';
import { MAX_LINE_LENGTH, MIN_LINE_LENGTH } from '../../track/track.constants';
import type { Track } from '../../track/track';
import type { TrackLayer } from '../../track/track-layer';
import { Line } from '../line/line';
import type { TrackObject } from '../track-object';
import type { CommandArea, CommandBlock } from './command-block';
import { CommandGroup } from './command-group';

/** Opacity of the objects hidden for the player, still drawn in the editor. */
const HIDDEN_OPACITY = 0.25;

/** Size of the buckets indexing the areas of the blocks, in world units. */
const INDEX_CELL_SIZE = 1000;

/** Offset of the objects drawn where they are, never modified. */
const NO_SHIFT = Object.freeze(new Vector());

const NO_OBJECTS: ReadonlySet<TrackObject> = new Set();

/**
 * Command blocks of a track, and the objects of their areas.
 *
 * Each object fully inside the area of a block, on its layer, is bound to it (see
 * `TrackObject.command`): the block with the lowest id when areas overlap. The bound objects
 * leave the render cache of their layer, as they change with the runners: each block draws its
 * objects from a cache of its own, shifted by its offset for the player (see
 * {@link CommandGroup}). The lines a block moves are also stored in the physics cells along their
 * way, to collide wherever they are.
 *
 * The bindings follow the changes of the track incrementally, before the next physics tick or
 * rendering ({@link CommandRegistry.refresh}): an added object is only checked against the blocks
 * indexed around it, and an added block only looks at the physics cells of its area.
 */
export class CommandRegistry {
    private readonly blocks = new Set<CommandBlock>();
    private readonly groups = new Map<CommandBlock, CommandGroup>();
    /** Blocks acting on an area, by layer then by bucket of {@link INDEX_CELL_SIZE} units. */
    private readonly index = new Map<TrackLayer, Map<string, Set<CommandBlock>>>();
    /** Layer and buckets each block is indexed in, to remove it from the index. */
    private readonly indexed = new Map<CommandBlock, { layer: TrackLayer; keys: string[] }>();
    private readonly changedBlocks = new Set<CommandBlock>();
    private readonly changedObjects = new Set<TrackObject>();

    public constructor(private readonly track: Track) {}

    public addBlock(block: CommandBlock): void {
        this.blocks.add(block);
        this.changedBlocks.add(block);
    }

    public removeBlock(block: CommandBlock): void {
        this.blocks.delete(block);
        this.changedBlocks.add(block);
    }

    /**
     * Requests the binding of an object to be checked again, as it was added or removed.
     *
     * Without any block, an object stays bound to none, and a block added later binds the
     * objects of its area from the physics cells (see {@link CommandRegistry.bindArea}): only the
     * lines kept out of the cells, too short or too long, are still checked. Most tracks have no
     * blocks, their objects then costing nothing here.
     */
    public objectChanged(object: TrackObject): void {
        if (
            this.blocks.size === 0 &&
            this.changedBlocks.size === 0 &&
            object.command === null &&
            CommandRegistry.inCells(object)
        ) {
            return;
        }
        this.changedObjects.add(object);
    }

    /** Whether an object is stored in the physics cells, as `Track.add` stores them. */
    private static inCells(object: TrackObject): boolean {
        return (
            !(object instanceof Line) ||
            (object.len >= MIN_LINE_LENGTH && object.len < MAX_LINE_LENGTH)
        );
    }

    /** Objects bound to a block. */
    public boundTo(block: CommandBlock): ReadonlySet<TrackObject> {
        return this.groups.get(block)?.objects ?? NO_OBJECTS;
    }

    /**
     * Updates the bindings after the blocks and objects added or removed since: the changed
     * blocks free their objects, then bind the ones of their area again if still on the track,
     * by id; then each changed or freed object is bound to the block around it, if any.
     */
    public refresh(): void {
        if (!this.changedBlocks.size && !this.changedObjects.size) {
            return;
        }

        const blocks = [...this.changedBlocks].sort((a, b) => a.id - b.id);
        const objects = new Set(this.changedObjects);
        this.changedBlocks.clear();
        this.changedObjects.clear();

        for (const block of blocks) {
            this.unindex(block);
            const group = this.groups.get(block);
            if (group) {
                [...group.objects].forEach((object) => {
                    this.detach(object);
                    objects.add(object);
                });
                group.clear();
                this.groups.delete(block);
            }
        }
        const active = blocks.filter((block) => this.blocks.has(block) && block.onTrack);
        active.forEach((block) => this.indexBlock(block));
        active.forEach((block) => this.bindArea(block));

        for (const object of objects) {
            if (this.blocks.has(object as CommandBlock)) {
                continue;
            }
            const target = object.onTrack ? this.lookup(object) : null;
            if (target === object.command) {
                continue;
            }
            if (object.command) {
                this.detach(object);
            }
            if (target) {
                this.attach(object, target);
            }
        }
    }

    /**
     * Binds the objects of the area of a block, taking them from the blocks of higher ids. The
     * candidates come from the physics cells of the area, or from the totals of the layer when
     * the area has more cells than the layer has objects.
     */
    private bindArea(block: CommandBlock): void {
        const { layer, settings } = block;
        const area = settings.area;
        if (!layer || !area || !block.actsOnArea) {
            return;
        }

        const grid = layer.grid;
        const size = grid.cellSize;
        const [fromX, toX] = [Math.floor(area.left / size), Math.floor(area.right / size)];
        const [fromY, toY] = [Math.floor(area.top / size), Math.floor(area.bottom / size)];
        const cellCount = (toX - fromX + 1) * (toY - fromY + 1);
        const objectCount =
            grid.totalSolidLines.size + grid.totalSceneryLines.size + grid.totalObjects.size;

        const candidates = new Set<TrackObject>();
        if (cellCount > objectCount) {
            grid.totalSolidLines.forEach((line) => candidates.add(line));
            grid.totalSceneryLines.forEach((line) => candidates.add(line));
            grid.totalObjects.forEach((item) => candidates.add(item));
        } else {
            for (let x = fromX; x <= toX; x++) {
                for (let y = fromY; y <= toY; y++) {
                    if (grid.has(x, y)) {
                        const cell = grid.cell(x, y);
                        cell.lines.forEach((line) => candidates.add(line));
                        cell.scenery.forEach((line) => candidates.add(line));
                        cell.objects.forEach((item) => candidates.add(item));
                    }
                }
            }
        }

        for (const object of candidates) {
            if (
                (object.command === null || object.command.id > block.id) &&
                object.onTrack &&
                !this.blocks.has(object as CommandBlock) &&
                CommandRegistry.fits(object, area)
            ) {
                if (object.command) {
                    this.detach(object);
                }
                this.attach(object, block);
            }
        }
    }

    /** Block with the lowest id whose area holds the object, among the blocks indexed around it. */
    private lookup(object: TrackObject): CommandBlock | null {
        const buckets = object.layer && this.index.get(object.layer);
        const blocks = buckets?.get(CommandRegistry.bucketKey(object.pos));
        let found: CommandBlock | null = null;

        blocks?.forEach((block) => {
            const area = block.settings.area;
            if (area && (!found || block.id < found.id) && CommandRegistry.fits(object, area)) {
                found = block;
            }
        });
        return found;
    }

    /**
     * Binds an object to a block: out of the render cache of its layer (see `Track.add`), into
     * the group of the block, and along its way for a moving block.
     */
    private attach(object: TrackObject, block: CommandBlock): void {
        const layer = object.layer;
        object.command = block;
        let group = this.groups.get(block);
        if (!group) {
            group = new CommandGroup();
            this.groups.set(block, group);
        }

        const moves = block.settings.kind === 'move' && layer;
        group.add(object, moves ? this.storeAlongMove(object, layer, block.settings.offset) : []);
        layer?.cache.remove(object);
    }

    /** Frees an object, back in the render cache of its layer while it is on the track. */
    private detach(object: TrackObject): void {
        const block = object.command;
        if (!block) {
            return;
        }
        this.groups.get(block)?.remove(object);
        object.command = null;
        if (object.onTrack && object.layer) {
            object.layer.cache.add(object);
        }
    }

    /**
     * Stores a moved object in the physics cells along its way too, every half cell, so that it
     * collides with the parts around it wherever it is.
     *
     * @returns The cells storing the object besides its own cells.
     */
    private storeAlongMove(object: TrackObject, layer: TrackLayer, offset: Vector): PhysicsCell[] {
        const grid = layer.grid;
        const own = new Set(grid.cellsCrossed(object.pos, object.endPos));
        const extra: PhysicsCell[] = [];
        const steps = Math.max(1, Math.ceil(offset.getLength() / (grid.cellSize / 2)));

        for (let step = 1; step <= steps; step++) {
            const shift = offset.scale(step / steps);
            for (const cell of grid.cellsCrossed(object.pos.add(shift), object.endPos.add(shift))) {
                if (!own.has(cell)) {
                    own.add(cell);
                    cell.push(object);
                    extra.push(cell);
                }
            }
        }
        return extra;
    }

    private indexBlock(block: CommandBlock): void {
        const { layer, settings } = block;
        const area = settings.area;
        if (!layer || !area || !block.actsOnArea) {
            return;
        }

        let buckets = this.index.get(layer);
        if (!buckets) {
            buckets = new Map();
            this.index.set(layer, buckets);
        }
        const keys: string[] = [];
        const from = CommandRegistry.bucket(new Vector(area.left, area.top));
        const to = CommandRegistry.bucket(new Vector(area.right, area.bottom));
        for (let x = from.x; x <= to.x; x++) {
            for (let y = from.y; y <= to.y; y++) {
                const key = `${x},${y}`;
                let bucket = buckets.get(key);
                if (!bucket) {
                    bucket = new Set();
                    buckets.set(key, bucket);
                }
                bucket.add(block);
                keys.push(key);
            }
        }
        this.indexed.set(block, { layer, keys });
    }

    private unindex(block: CommandBlock): void {
        const entry = this.indexed.get(block);
        if (!entry) {
            return;
        }
        const buckets = this.index.get(entry.layer);
        for (const key of entry.keys) {
            const bucket = buckets?.get(key);
            bucket?.delete(block);
            if (bucket?.size === 0) {
                buckets?.delete(key);
            }
        }
        this.indexed.delete(block);
    }

    /**
     * Draws the objects of the blocks of a layer as the player sees them: hidden, moved, or as
     * they are, when in view. The hidden ones are drawn faded in the editor, to be edited (see
     * `Track.editing`).
     *
     * @param fastRender - Whether the densest tiles are rendered by the workers.
     */
    public render(ctx: CanvasRenderingContext2D, layer: TrackLayer, fastRender: boolean): void {
        const track = this.track;
        const topLeft = track.toWorld(new Vector(0, 0));
        const bottomRight = track.toWorld(new Vector(track.viewWidth, track.viewHeight));
        const view = {
            left: topLeft.x,
            top: topLeft.y,
            right: bottomRight.x,
            bottom: bottomRight.y,
        };

        for (const [block, group] of this.groups) {
            if (block.layer !== layer || group.size === 0) {
                continue;
            }
            const offset = block.offsetFor(track.playerRunner);
            if (offset === null && !track.editing) {
                continue;
            }

            ctx.save();
            if (offset === null) {
                ctx.globalAlpha = HIDDEN_OPACITY;
            }
            group.render(ctx, track, {
                view,
                offset: offset ?? NO_SHIFT,
                opacityFactor: layer.opacityFactor,
                fastRender,
            });
            ctx.restore();
        }
    }

    /**
     * Whether an object is fully inside an area, and stored in the grid cells: the lines too
     * short or too long are not.
     */
    private static fits(object: TrackObject, area: CommandArea): boolean {
        const stored =
            !(object instanceof Line) ||
            (object.len >= MIN_LINE_LENGTH && object.len < MAX_LINE_LENGTH);
        return (
            stored &&
            CommandRegistry.inside(object.pos, area) &&
            CommandRegistry.inside(object.endPos, area)
        );
    }

    private static inside(point: Vector, area: CommandArea): boolean {
        return (
            point.x >= area.left &&
            point.x <= area.right &&
            point.y >= area.top &&
            point.y <= area.bottom
        );
    }

    private static bucket(point: Vector): Vector {
        return new Vector(
            Math.floor(point.x / INDEX_CELL_SIZE),
            Math.floor(point.y / INDEX_CELL_SIZE),
        );
    }

    private static bucketKey(point: Vector): string {
        const bucket = CommandRegistry.bucket(point);
        return `${bucket.x},${bucket.y}`;
    }
}
