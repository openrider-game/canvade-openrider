import { Vector } from 'canvade';
import { BIKE_MAP, DEFAULT_BIKE } from '../bike/bike.constants';
import type { RenderCell } from '../grid/cell/render-cell';
import type { Grid } from '../grid/grid';
import { ITEM_MAP } from '../item/item.constants';
import { LineClass } from '../item/line/line';
import { SceneryLine } from '../item/line/scenery-line';
import { SolidLine } from '../item/line/solid-line';
import { RenderPriority, WorkerPool } from '../thread/worker-pool';
import { Track } from '../track/track';
import { MIN_ZOOM } from '../track/track.constants';
import { TrackLayer } from '../track/track-layer';

interface ParserData {
    code: string[];
    index: number;
}

// Number of entities parsed on each step
const STEP_SIZE = 1000;

/**
 * Parses a track code a few entities at a time, so that the parsing state can display its
 * progress, then pre-renders the cache of the track layers.
 *
 * Track codes are formatted as
 * `solid lines#scenery lines#items#foreground solid lines#foreground scenery lines#bike#origin`.
 * Entities are separated by `,` within a section, and coordinates are integers in base 32.
 * Missing trailing sections fall back to empty sections, the default bike and the origin `0 0`.
 *
 * Call {@link TrackParser.init}, then {@link TrackParser.currentStep} until
 * {@link TrackParser.done}.
 */
export class TrackParser {
    public done = false;
    /** Next step to run, each step parsing up to 1000 entities or caching one cell. */
    public currentStep: () => void = this.parseSolidLines;
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

    private solidLineData = TrackParser.emptyData();
    private sceneryLineData = TrackParser.emptyData();
    private itemData = TrackParser.emptyData();
    private foregroundSolidLineData = TrackParser.emptyData();
    private foregroundSceneryLineData = TrackParser.emptyData();
    private codeBike = '';
    private codeOrigin = '';

    private cacheIndex = 0;
    /**
     * Number of cell images to render, {@link TrackParser.proxyIndex} being the number
     * rendered.
     */
    private renderIndex = 0;
    private proxyIndex = 0;

    public constructor(public readonly track: Track) {}

    private static emptyData(): ParserData {
        return { code: [], index: 0 };
    }

    /** Splits the track code into its sections. */
    public init(rawTrack: string): void {
        this.split(rawTrack);

        this.length =
            this.solidLineData.code.length +
            this.sceneryLineData.code.length +
            this.itemData.code.length +
            this.foregroundSolidLineData.code.length +
            this.foregroundSceneryLineData.code.length;
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
            this.progress =
                this.solidLineData.index +
                this.sceneryLineData.index +
                this.itemData.index +
                this.foregroundSolidLineData.index +
                this.foregroundSceneryLineData.index;
        }
    }

    private split(rawTrack: string): void {
        const [solid, scenery, items, foregroundSolid, foregroundScenery, bike, origin] =
            rawTrack.split('#');

        this.solidLineData.code = (solid ?? '').split(',');
        this.sceneryLineData.code = (scenery ?? '').split(',');
        this.itemData.code = (items ?? '').split(',');
        this.foregroundSolidLineData.code = (foregroundSolid ?? '').split(',');
        this.foregroundSceneryLineData.code = (foregroundScenery ?? '').split(',');
        this.codeBike = bike || DEFAULT_BIKE.bikeName;
        this.codeOrigin = origin || '0 0';
    }

    private parseSolidLines(): void {
        this.progressLabel = 'Solid lines';
        this.parseLines(
            this.solidLineData,
            SolidLine,
            this.track.mainLayer,
            this.parseSceneryLines,
        );
    }

    private parseSceneryLines(): void {
        this.progressLabel = 'Scenery lines';
        this.parseLines(this.sceneryLineData, SceneryLine, this.track.mainLayer, this.parseItems);
    }

    private parseItems(): void {
        this.progressLabel = 'Items';

        const l = Math.min(this.itemData.index + STEP_SIZE, this.itemData.code.length);
        for (; this.itemData.index < l; this.itemData.index++) {
            const itemCode = this.itemData.code[this.itemData.index].split(' ');
            const itemClass = itemCode.length > 2 ? ITEM_MAP.get(itemCode[0]) : undefined;

            if (itemClass) {
                const item = itemClass.createInstance(itemCode, this.track);
                item.layer = this.track.mainLayer;
                item.addToTrack();
            }
        }

        if (this.itemData.index >= this.itemData.code.length) {
            this.currentStep = this.parseForegroundSolidLines;
        }
    }

    private parseForegroundSolidLines(): void {
        this.progressLabel = 'Foreground Solid lines';
        this.parseLines(
            this.foregroundSolidLineData,
            SolidLine,
            this.track.foregroundLayer,
            this.parseForegroundSceneryLines,
        );
    }

    private parseForegroundSceneryLines(): void {
        this.progressLabel = 'Foreground Scenery lines';
        this.parseLines(
            this.foregroundSceneryLineData,
            SceneryLine,
            this.track.foregroundLayer,
            this.parseOrigin,
        );
    }

    private parseOrigin(): void {
        this.progressLabel = 'Origin';
        const [x, y] = this.codeOrigin.split(' ');
        const originVector = new Vector(parseInt(x, 32), parseInt(y, 32));
        this.track.origin.set(originVector);
        this.track.camera.set(originVector);

        this.currentStep = this.parseBike;
    }

    private parseBike(): void {
        this.progressLabel = 'Bike';
        const playerRunner = this.track.playerRunner;
        playerRunner.bikeClass = BIKE_MAP.get(this.codeBike) ?? DEFAULT_BIKE;
        playerRunner.createBike();
        this.track.focalPoint = playerRunner.instance?.hitbox ?? null;

        this.currentStep = this.processMainCache;
        this.caching = true;
    }

    private processMainCache(): void {
        this.progressLabel = 'Main cache';
        this.processCache(this.track.mainLayer, this.processForegroundCache);
    }

    private processForegroundCache(): void {
        this.progressLabel = 'Foreground cache';
        this.processCache(this.track.foregroundLayer, this.finish);
    }

    private finish(): void {
        this.done = true;
    }

    /**
     * Parses lines: each line code is a polyline, a list of base 32 `x y` coordinates separated
     * with spaces, each point being linked to the next one.
     */
    private parseLines(
        lineData: ParserData,
        lineClass: LineClass,
        layer: TrackLayer,
        next: () => void,
    ): void {
        const l = Math.min(lineData.index + STEP_SIZE, lineData.code.length);
        for (; lineData.index < l; lineData.index++) {
            const lineCode = lineData.code[lineData.index].split(' ');
            if (lineCode.length > 3) {
                for (let k = 0, m = lineCode.length - 2; k < m; k += 2) {
                    const line = new lineClass(
                        new Vector(parseInt(lineCode[k], 32), parseInt(lineCode[k + 1], 32)),
                        new Vector(parseInt(lineCode[k + 2], 32), parseInt(lineCode[k + 3], 32)),
                        this.track,
                    );

                    line.layer = layer;
                    line.addToTrack();
                }
            }
        }

        if (lineData.index >= lineData.code.length) {
            this.currentStep = next;
        }
    }

    /**
     * Pre-renders one cell per step at every zoom level up to 1, the densest cells being
     * rendered by the workers. Waits for the workers before going to the next step.
     */
    private processCache(layer: TrackLayer, next: () => void): void {
        const cache: Grid<RenderCell> = layer.cache;
        const cacheCells = Array.from(cache.cells.values());
        const l = Math.min(this.cacheIndex + 1, cacheCells.length);

        for (; this.cacheIndex < l; this.cacheIndex++) {
            const cell = cacheCells[this.cacheIndex];
            for (let zoom = MIN_ZOOM; zoom <= 1; zoom = Math.round((zoom + 0.2) * 100) / 100) {
                if (cell.isHeavy()) {
                    WorkerPool.request(
                        cell,
                        zoom,
                        layer.opacityFactor,
                        RenderPriority.PRELOAD,
                        () => this.proxyIndex++,
                    );
                } else {
                    this.proxyIndex++;
                }

                this.renderIndex++;
            }
        }

        if (this.cacheIndex >= cacheCells.length && this.proxyIndex >= this.renderIndex) {
            this.proxyIndex = 0;
            this.renderIndex = 0;
            this.cacheIndex = 0;
            this.currentStep = next;
        }
    }
}
