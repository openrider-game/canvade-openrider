import { Vector } from 'canvade';
import { BIKE_MAP, DEFAULT_BIKE } from '../bike/bike.constants';
import { ITEM_MAP } from '../item/item.constants';
import { LineClass } from '../item/line/line';
import { SceneryLine } from '../item/line/scenery-line';
import { SolidLine } from '../item/line/solid-line';
import { RenderPriority, WorkerPool } from '../thread/worker-pool';
import { Track } from '../track/track';
import { TrackLayer } from '../track/track-layer';
import { Zoom } from '../track/zoom';
import { TrackDocument, TrackFormat } from './track-format';

interface ParserData {
    code: string[];
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

// Number of entities parsed on each step
const STEP_SIZE = 1000;

/**
 * Parses a track code or an editor file a few entities at a time, so that the parsing state can
 * display its progress, then pre-renders the cache of the track layers.
 *
 * Both formats are described by `TrackFormat`. Entities are separated by `,` within a section,
 * and coordinates are integers in base 32. The parsed layers replace the layers of the track,
 * the first main layer becoming the active one.
 *
 * Call {@link TrackParser.init}, then {@link TrackParser.currentStep} until
 * {@link TrackParser.done}.
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

    private steps: ParserStep[] = [];
    private stepIndex = 0;
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
     * @throws When the code is an invalid editor file.
     */
    public init(rawTrack: string): void {
        const document = TrackFormat.read(rawTrack);
        const layers = document.layers.map(
            ({ type, name, visible }) => new TrackLayer(type, name, visible),
        );
        this.track.layers.reset(layers);

        this.steps = [
            ...document.layers.flatMap((layerDocument, index) => {
                const layer = layers[index];
                return [
                    this.lineStep(layer, 'Solid lines', layerDocument.solid, SolidLine),
                    this.lineStep(layer, 'Scenery lines', layerDocument.scenery, SceneryLine),
                    this.itemStep(layer, layerDocument.items),
                ];
            }),
            this.originStep(document),
            this.bikeStep(document),
            ...layers.map((layer) => this.cacheStep(layer)),
        ];

        this.length = this.sections.reduce((total, section) => total + section.code.length, 0);
        this.progressLabel = this.steps[0].label;
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

    private section(code: string): ParserData {
        const data = { code: code.split(','), index: 0 };
        this.sections.push(data);
        return data;
    }

    /**
     * Parses lines: each line code is a polyline, a list of base 32 `x y` coordinates separated
     * with spaces, each point being linked to the next one.
     */
    private lineStep(
        layer: TrackLayer,
        label: string,
        code: string,
        lineClass: LineClass,
    ): ParserStep {
        const data = this.section(code);
        return {
            label: `${label} (${layer.name})`,
            caching: false,
            run: () => {
                const l = Math.min(data.index + STEP_SIZE, data.code.length);
                for (; data.index < l; data.index++) {
                    const lineCode = data.code[data.index].split(' ');
                    if (lineCode.length > 3) {
                        for (let k = 0, m = lineCode.length - 2; k < m; k += 2) {
                            const line = new lineClass(
                                TrackParser.point(lineCode, k),
                                TrackParser.point(lineCode, k + 2),
                                this.track,
                            );

                            line.layer = layer;
                            line.addToTrack();
                        }
                    }
                }
                return data.index >= data.code.length;
            },
        };
    }

    /** Reads the base 32 `x y` point starting at an index of a split entity code. */
    private static point(code: string[], index: number): Vector {
        return new Vector(parseInt(code[index], 32), parseInt(code[index + 1], 32));
    }

    /** Parses items, skipping the unknown item codes. */
    private itemStep(layer: TrackLayer, code: string): ParserStep {
        const data = this.section(code);
        return {
            label: `Items (${layer.name})`,
            caching: false,
            run: () => {
                const l = Math.min(data.index + STEP_SIZE, data.code.length);
                for (; data.index < l; data.index++) {
                    const itemCode = data.code[data.index].split(' ');
                    const itemClass = itemCode.length > 2 ? ITEM_MAP.get(itemCode[0]) : undefined;

                    if (itemClass) {
                        const item = itemClass.createInstance(itemCode, this.track);
                        item.layer = layer;
                        item.addToTrack();
                    }
                }
                return data.index >= data.code.length;
            },
        };
    }

    private originStep(document: TrackDocument): ParserStep {
        return {
            label: 'Origin',
            caching: false,
            run: () => {
                const [x, y] = document.origin.split(' ');
                const originVector = new Vector(parseInt(x, 32), parseInt(y, 32));
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

    /**
     * Pre-renders one cell per step at every view zoom up to 1, at the pixel ratio of the
     * track, the densest cells being rendered by the workers. Waits for the workers before going
     * to the next step.
     *
     * Without workers support, the cells are rendered when first displayed instead.
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
                    for (const viewZoom of Zoom.levels(1)) {
                        if (cell.isHeavy() && WorkerPool.supported) {
                            WorkerPool.request(
                                cell,
                                Zoom.toPixel(viewZoom, this.track.pixelRatio),
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
                    return true;
                }
                return false;
            },
        };
    }
}
