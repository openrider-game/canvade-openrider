import type { TrackObject } from '../item/track-object';
import type { Track } from '../track/track';
import type { TrackLayer } from '../track/track-layer';
import { LayerDocument, TrackDocument, TrackFormat } from './track-format';

/** Section of a layer being serialized. */
interface GeneratorData {
    objects: TrackObject[];
    index: number;
    code: string;
}

/** Sections of a layer being serialized. */
interface LayerData {
    layer: TrackLayer;
    solid: GeneratorData;
    scenery: GeneratorData;
    items: GeneratorData;
}

// Number of entities serialized on each step
const STEP_SIZE = 1000;

/**
 * Serializes a track a few entities at a time, so that the export can display its progress.
 *
 * Each layer is serialized in the entity format of the track codes; the result can then be read
 * as a track code (main layers and foreground layers merged, see `TrackFormat`) or as an editor
 * file keeping every layer.
 *
 * Call {@link TrackGenerator.currentStep} until {@link TrackGenerator.done}, then read the
 * result with {@link TrackGenerator.getCode} or {@link TrackGenerator.getEditorCode}.
 */
export class TrackGenerator {
    public done = false;
    /** Number of entities processed so far, updated by {@link TrackGenerator.updateIndicators}. */
    public progress = 0;
    /** Total number of entities to process. */
    public readonly length: number;

    private readonly layers: LayerData[];
    /** Sections in serialization order, each one being done before the next one starts. */
    private readonly sections: GeneratorData[];
    private sectionIndex = 0;

    public constructor(private readonly track: Track) {
        const section = (objects: Map<number, TrackObject>): GeneratorData => ({
            objects: Array.from(objects.values()),
            index: 0,
            code: '',
        });

        this.layers = track.layers.all.map((layer) => ({
            layer,
            solid: section(layer.grid.totalSolidLines),
            scenery: section(layer.grid.totalSceneryLines),
            items: section(layer.grid.totalObjects),
        }));
        this.sections = this.layers.flatMap(({ solid, scenery, items }) => [solid, scenery, items]);
        this.length = this.sections.reduce((total, data) => total + data.objects.length, 0);
    }

    /** Updates {@link TrackGenerator.progress} from the state of every section. */
    public updateIndicators(): void {
        this.progress = this.sections.reduce((total, data) => total + data.index, 0);
    }

    /**
     * Serializes up to 1000 objects of the current section that were not recorded yet:
     * connected lines are exported along with the first line of their polyline, and linked items
     * along with their group.
     */
    public currentStep(): void {
        const data = this.sections[this.sectionIndex];
        if (!data) {
            this.finish();
            return;
        }

        const l = Math.min(data.index + STEP_SIZE, data.objects.length);
        for (; data.index < l; data.index++) {
            const obj = data.objects[data.index];
            if (!obj.recorded) {
                data.code += `${obj.toString()},`;
            }
        }

        if (data.index >= data.objects.length) {
            this.sectionIndex++;
            if (this.sectionIndex >= this.sections.length) {
                this.finish();
            }
        }
    }

    private finish(): void {
        this.cleanup();
        this.done = true;
    }

    /** Resets the recorded flags so that the track can be exported again. */
    private cleanup(): void {
        for (const data of this.sections) {
            data.objects.forEach((obj) => (obj.recorded = false));
        }
    }

    /** Content of the track, once every step is done. */
    public getDocument(): TrackDocument {
        return {
            layers: this.layers.map(({ layer, solid, scenery, items }): LayerDocument => ({
                name: layer.name,
                type: layer.type,
                visible: layer.visible,
                solid: solid.code,
                scenery: scenery.code,
                items: items.code,
            })),
            bike: this.track.playerRunner.bikeClass.bikeName,
            origin: this.track.origin.toString(),
        };
    }

    /** Track code of the track, playable by the original game, once every step is done. */
    public getCode(): string {
        return TrackFormat.toTrackCode(this.getDocument());
    }

    /** Editor file of the track, keeping its layers, once every step is done. */
    public getEditorCode(): string {
        return TrackFormat.toEditorCode(this.getDocument());
    }
}
