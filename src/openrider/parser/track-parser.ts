import { Vector } from 'canvade';
import { BIKE_MAP, DEFAULT_BIKE } from '../bike/bike.constants';
import { ITEM_MAP } from '../item/item.constants';
import { LineClass } from '../item/line/line';
import { SceneryLine } from '../item/line/scenery-line';
import { SolidLine } from '../item/line/solid-line';
import { RenderPriority, WorkerPool } from '../thread/worker-pool';
import { Track } from '../track/track';
import { TrackLayer } from '../track/track-layer';
import { MIN_ZOOM } from '../track/track.constants';
import { Zoom } from '../track/zoom';
import type { ItemEntity, Polyline, TrackDocument } from './track-document';
import { TrackFormat } from './track-format';

/** Entities of a section, parsed up to {@link ParserData.index}. */
interface ParserData {
    length: number;
    index: number;
}

/** Step of the parsing, run until it returns `true`. */
interface ParserStep {
    /** Name of the step, displayed with the progress. */
    label: string;
    /** Whether the step pre-renders cells rather than parsing entities. */
    caching: boolean;
    run(): boolean;
}

/**
 * Number of entities parsed on each step: small enough for {@link TrackParser.runFor} to keep to
 * its time budget, a step of items taking about a millisecond.
 */
const STEP_SIZE = 250;

/**
 * Distance from the start position to the centers of the cells pre-rendered at the zoom of the
 * track, on each axis, in world units: a wide screen around the start at the default zoom.
 */
const START_RENDER_DISTANCE = { x: 1600, y: 1000 };

/**
 * Parses a track file a few entities at a time, so that the parsing state can display its
 * progress, then pre-renders the densest cells of the track layers.
 *
 * Every format is read by `TrackFormat` first, the parser then adding its entities to the
 * track: polylines and items. The parsed layers replace the layers of the track, the first main
 * layer becoming the active one.
 *
 * Call {@link TrackParser.init}, then {@link TrackParser.runFor} on each frame, or
 * {@link TrackParser.currentStep}, until {@link TrackParser.done}.
 */
export class TrackParser {
    public done = false;
    /**
     * Number of entities (or cell images) processed so far, see
     * {@link TrackParser.updateIndicators}.
     */
    public progress = 0;
    /** Total number of entities (or cell images) to process. */
    public length = 1;
    /** Name of the current step, displayed with the progress. */
    public progressLabel = '';
    /** Whether the parser is pre-rendering the cache, after every entity has been parsed. */
    public caching = false;
    /**
     * Whether the last step waits for the workers to render the cells it requested, running it
     * again until they did being of no use.
     */
    private waiting = false;

    private steps: ParserStep[] = [];
    private stepIndex = 0;
    /**
     * Objects created so far, numbering them for the edits of the track: the same ids on every
     * screen parsing the same code (see `TrackEditor`).
     */
    private objectCount = 0;
    private readonly sections: ParserData[] = [];

    private cacheIndex = 0;
    /**
     * Number of cell images to render, {@link TrackParser.proxyIndex} being the number
     * rendered.
     */
    private renderIndex = 0;
    private proxyIndex = 0;

    public constructor(public readonly track: Track) {}

    /**
     * Reads the code and creates the layers of the track, empty until the steps fill them.
     *
     * @param rawTrack - Track file or code, in any format (see `TrackFormat.read`).
     * @throws When the code is an invalid track file or editor file.
     */
    public init(rawTrack: string | Uint8Array): void {
        const document = TrackFormat.read(rawTrack);
        const layers = document.layers.map(
            ({ type, name, visible }) => new TrackLayer(type, name, visible),
        );
        this.track.layers.reset(layers);

        this.steps = [
            ...document.layers.flatMap((layerDocument, index) => {
                const layer = layers[index];
                // The scenery of every color in one step, each polyline with its color
                const scenery = layerDocument.scenery.flatMap((group) => group.polylines);
                const colors = layerDocument.scenery.flatMap((group) =>
                    group.polylines.map(() => group.color),
                );
                return [
                    this.lineStep(layer, 'Solid lines', layerDocument.solid, SolidLine),
                    this.lineStep(layer, 'Scenery lines', scenery, SceneryLine, colors),
                    this.itemStep(layer, layerDocument.items),
                ];
            }),
            this.originStep(document),
            this.bikeStep(document),
            ...layers.map((layer) => this.cacheStep(layer)),
        ];

        this.length = this.sections.reduce((total, section) => total + section.length, 0);
        this.progressLabel = this.steps[0].label;
    }

    /**
     * Runs as many steps as fit in a time budget, e.g. the time of a frame, so that a track is
     * parsed as fast as it can while the progress is displayed: until the parsing is done, the
     * budget spent, or a step waits for the workers. Then updates the indicators.
     *
     * @param budget - Time to run steps for, in milliseconds: at least one step runs.
     */
    public runFor(budget: number): void {
        const end = performance.now() + budget;
        do {
            this.currentStep();
        } while (!this.done && !this.waiting && performance.now() < end);
        this.updateIndicators();
    }

    /** Runs the current step, moving to the next one once it is complete. */
    public currentStep(): void {
        const step = this.steps[this.stepIndex];
        if (!step) {
            this.done = true;
            return;
        }

        this.progressLabel = step.label;
        this.caching = step.caching;
        this.waiting = false;
        if (step.run()) {
            this.stepIndex++;
            this.done = this.stepIndex >= this.steps.length;
        }
    }

    /**
     * Updates {@link TrackParser.progress} and {@link TrackParser.length} from the state of
     * the current step.
     */
    public updateIndicators(): void {
        if (this.caching) {
            this.progress = this.proxyIndex;
            this.length = this.renderIndex;
        } else {
            this.progress = this.sections.reduce((total, section) => total + section.index, 0);
        }
    }

    /**
     * Section of a number of entities. An empty section counts as one entity, as the empty
     * sections of the original track codes did, so that its step shows progress too.
     */
    private section(length: number): ParserData {
        const data = { length: Math.max(length, 1), index: 0 };
        this.sections.push(data);
        return data;
    }

    /**
     * Parses polylines, each point being linked to the next one.
     *
     * @param colors - Color of each polyline, see `Line.color`; 0 for every one without.
     */
    private lineStep(
        layer: TrackLayer,
        label: string,
        polylines: Polyline[],
        lineClass: LineClass,
        colors: number[] = [],
    ): ParserStep {
        const data = this.section(polylines.length);
        return {
            label: `${label} (${layer.name})`,
            caching: false,
            run: () => {
                const l = Math.min(data.index + STEP_SIZE, polylines.length);
                for (; data.index < l; data.index++) {
                    const points = polylines[data.index];
                    const color = colors[data.index] ?? 0;
                    for (let k = 0; k + 3 < points.length; k += 2) {
                        const line = new lineClass(
                            new Vector(points[k], points[k + 1]),
                            new Vector(points[k + 2], points[k + 3]),
                            this.track,
                        );

                        line.color = color;
                        line.layer = layer;
                        line.uid = `p${this.objectCount++}`;
                        line.addToTrack();
                    }
                }
                return TrackParser.finished(data, polylines.length);
            },
        };
    }

    /** Parses items, skipping the unknown item letters. */
    private itemStep(layer: TrackLayer, items: ItemEntity[]): ParserStep {
        const data = this.section(items.length);
        return {
            label: `Items (${layer.name})`,
            caching: false,
            run: () => {
                const l = Math.min(data.index + STEP_SIZE, items.length);
                for (; data.index < l; data.index++) {
                    const { code, values } = items[data.index];
                    const itemClass = ITEM_MAP.get(code);

                    if (itemClass) {
                        const item = itemClass.createInstance(values, this.track);
                        item.layer = layer;
                        item.uid = `p${this.objectCount++}`;
                        item.addToTrack();
                    }
                }
                return TrackParser.finished(data, items.length);
            },
        };
    }

    /**
     * Whether every entity of a section was parsed, its progress then reaching its length, an
     * empty section counting one entity.
     */
    private static finished(data: ParserData, count: number): boolean {
        if (data.index < count) {
            return false;
        }
        data.index = data.length;
        return true;
    }

    private originStep(document: TrackDocument): ParserStep {
        return {
            label: 'Origin',
            caching: false,
            run: () => {
                const originVector = new Vector(document.origin.x, document.origin.y);
                this.track.origin.set(originVector);
                this.track.camera.set(originVector);
                return true;
            },
        };
    }

    private bikeStep(document: TrackDocument): ParserStep {
        return {
            label: 'Bike',
            caching: false,
            run: () => {
                const playerRunner = this.track.playerRunner;
                playerRunner.bikeClass = BIKE_MAP.get(document.bike) ?? DEFAULT_BIKE;
                playerRunner.createBike();
                this.track.focalPoint = playerRunner.instance?.hitbox ?? null;
                return true;
            },
        };
    }

    /** Whether a cell is around the start position, in view when the track starts. */
    private nearStart(cell: { x: number; y: number; size: number }): boolean {
        const { origin } = this.track;
        return (
            Math.abs(cell.x + cell.size / 2 - origin.x) <= START_RENDER_DISTANCE.x &&
            Math.abs(cell.y + cell.size / 2 - origin.y) <= START_RENDER_DISTANCE.y
        );
    }

    /**
     * Pre-renders the densest cells in the workers, one cell per step, at the pixel ratio of the
     * track: every one at the lowest zoom, the fallback scaled while a cell renders, and those
     * around the start position at the zoom of the track too, seen first. Waits for the workers
     * before going to the next step.
     *
     * The other cells, and every cell without workers support, are rendered when first displayed,
     * at the zoom they are displayed at.
     */
    private cacheStep(layer: TrackLayer): ParserStep {
        return {
            label: `Cache (${layer.name})`,
            caching: true,
            run: () => {
                const cacheCells = Array.from(layer.cache.cells.values());
                const l = Math.min(this.cacheIndex + 1, cacheCells.length);

                for (; this.cacheIndex < l; this.cacheIndex++) {
                    const cell = cacheCells[this.cacheIndex];
                    if (!cell.isHeavy() || !WorkerPool.supported) {
                        continue;
                    }
                    const zooms = [Zoom.toPixel(MIN_ZOOM, this.track.pixelRatio)];
                    if (this.nearStart(cell)) {
                        zooms.push(this.track.zoomFactor);
                    }
                    for (const zoom of new Set(zooms)) {
                        this.renderIndex++;
                        WorkerPool.request(
                            cell,
                            zoom,
                            layer.opacityFactor,
                            RenderPriority.PRELOAD,
                            () => this.proxyIndex++,
                        );
                    }
                }

                if (this.cacheIndex < cacheCells.length) {
                    return false;
                }
                if (this.proxyIndex < this.renderIndex) {
                    this.waiting = true;
                    return false;
                }
                this.proxyIndex = 0;
                this.renderIndex = 0;
                this.cacheIndex = 0;
                return true;
            },
        };
    }
}
