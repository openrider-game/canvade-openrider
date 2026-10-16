import type { TrackObject } from '../item/track-object';
import type { Track } from '../track/track';

interface GeneratorData {
    code: string;
    index: number;
}

// Number of entities serialized on each step
const STEP_SIZE = 1000;

/**
 * Generates the code of a track a few entities at a time, so that the export can display its
 * progress, in the format read by the `TrackParser`.
 *
 * Call {@link TrackGenerator.currentStep} until {@link TrackGenerator.done}, then read the
 * result with {@link TrackGenerator.getCode}.
 */
export class TrackGenerator {
    public done = false;
    /** Next step to run, each step serializing up to 1000 entities. */
    public currentStep: () => void = this.generateLines;
    /** Number of entities processed so far, updated by {@link TrackGenerator.updateIndicators}. */
    public progress = 0;
    /** Total number of entities to process. */
    public readonly length: number;

    private readonly lineData = TrackGenerator.emptyData();
    private readonly sceneryData = TrackGenerator.emptyData();
    private readonly objectData = TrackGenerator.emptyData();
    private readonly foregroundLineData = TrackGenerator.emptyData();
    private readonly foregroundSceneryData = TrackGenerator.emptyData();

    public constructor(private readonly track: Track) {
        const grid = this.track.mainLayer.grid;
        const foregroundGrid = this.track.foregroundLayer.grid;

        this.length =
            grid.totalSolidLines.size +
            grid.totalSceneryLines.size +
            grid.totalObjects.size +
            foregroundGrid.totalSolidLines.size +
            foregroundGrid.totalSceneryLines.size;
    }

    private static emptyData(): GeneratorData {
        return { code: '', index: 0 };
    }

    /** Updates {@link TrackGenerator.progress} from the state of every step. */
    public updateIndicators(): void {
        this.progress =
            this.lineData.index +
            this.foregroundLineData.index +
            this.sceneryData.index +
            this.foregroundSceneryData.index +
            this.objectData.index;
    }

    /**
     * Serializes the objects that were not recorded yet: connected lines are exported
     * along with the first line of their polyline, and linked items along with their group.
     */
    private generate(
        data: GeneratorData,
        objects: Map<number, TrackObject>,
        next: () => void,
    ): void {
        const elements = Array.from(objects.values());
        const l = Math.min(data.index + STEP_SIZE, elements.length);
        for (; data.index < l; data.index++) {
            const obj = elements[data.index];
            if (!obj.recorded) {
                data.code += `${obj.toString()},`;
            }
        }

        if (data.index >= elements.length) {
            this.currentStep = next;
        }
    }

    private generateLines(): void {
        this.generate(
            this.lineData,
            this.track.mainLayer.grid.totalSolidLines,
            this.generateScenery,
        );
    }

    private generateScenery(): void {
        this.generate(
            this.sceneryData,
            this.track.mainLayer.grid.totalSceneryLines,
            this.generateObjects,
        );
    }

    private generateObjects(): void {
        this.generate(
            this.objectData,
            this.track.mainLayer.grid.totalObjects,
            this.generateForegroundLines,
        );
    }

    private generateForegroundLines(): void {
        this.generate(
            this.foregroundLineData,
            this.track.foregroundLayer.grid.totalSolidLines,
            this.generateForegroundScenery,
        );
    }

    private generateForegroundScenery(): void {
        this.generate(
            this.foregroundSceneryData,
            this.track.foregroundLayer.grid.totalSceneryLines,
            this.finish,
        );
    }

    private finish(): void {
        this.cleanup();
        this.done = true;
    }

    /** Resets the recorded flags so that the track can be exported again. */
    private cleanup(): void {
        for (const layer of [this.track.mainLayer, this.track.foregroundLayer]) {
            const grid = layer.grid;
            for (const objects of [
                grid.totalSolidLines,
                grid.totalSceneryLines,
                grid.totalObjects,
            ]) {
                objects.forEach((obj: TrackObject) => (obj.recorded = false));
            }
        }
    }

    /** Assembles the track code, once every step is done. */
    public getCode(): string {
        return (
            `${this.lineData.code}#${this.sceneryData.code}#${this.objectData.code}#` +
            `${this.foregroundLineData.code}#${this.foregroundSceneryData.code}#` +
            `${this.track.playerRunner.bikeClass.bikeName}#${this.track.origin.toString()}`
        );
    }
}
