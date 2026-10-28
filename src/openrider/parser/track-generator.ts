import type { Item } from '../item/item';
import type { Line } from '../item/line/line';
import type { TrackObject } from '../item/track-object';
import type { Track } from '../track/track';
import type { TrackLayer } from '../track/track-layer';
import { addScenery, type LayerDocument, type TrackDocument } from './track-document';
import { TrackFormat } from './track-format';

/** Section of a layer being serialized. */
interface GeneratorData {
    objects: TrackObject[];
    index: number;
    /** Adds an object not recorded yet to the layer document. */
    record(object: TrackObject): void;
}

/** Sections of a layer being serialized, into its document. */
interface LayerData {
    layer: TrackLayer;
    document: LayerDocument;
}

// Number of entities serialized on each step
const STEP_SIZE = 1000;

/**
 * Serializes a track a few entities at a time, so that the export can display its progress.
 *
 * Each layer is serialized into a `LayerDocument`: connected lines as polylines, scenery lines
 * by color. The result can then be written as a track code (main layers and foreground layers
 * merged, see `TrackFormat`) or as an editor file keeping every layer.
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
        this.layers = track.layers.all.map((layer) => ({
            layer,
            document: {
                name: layer.name,
                type: layer.type,
                visible: layer.visible,
                solid: [],
                scenery: [],
                items: [],
            },
        }));
        this.sections = this.layers.flatMap(({ layer, document }) => [
            TrackGenerator.section(layer.grid.totalSolidLines, (object) =>
                document.solid.push((object as Line).toPolyline()),
            ),
            TrackGenerator.section(layer.grid.totalSceneryLines, (object) =>
                addScenery(document.scenery, (object as Line).color, [
                    (object as Line).toPolyline(),
                ]),
            ),
            TrackGenerator.section(layer.grid.totalObjects, (object) =>
                document.items.push((object as Item).toEntity()),
            ),
        ]);
        this.length = this.sections.reduce((total, data) => total + data.objects.length, 0);
    }

    private static section(
        objects: Map<number, TrackObject>,
        record: (object: TrackObject) => void,
    ): GeneratorData {
        return { objects: Array.from(objects.values()), index: 0, record };
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
                data.record(obj);
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
            layers: this.layers.map(({ document }) => document),
            bike: this.track.playerRunner.bikeClass.bikeName,
            origin: { x: Math.round(this.track.origin.x), y: Math.round(this.track.origin.y) },
        };
    }

    /** Track code of the track, its layers of each type merged, once every step is done. */
    public getCode(): string {
        return TrackFormat.toTrackCode(this.getDocument());
    }

    /** Editor file of the track, keeping its layers, once every step is done. */
    public getEditorCode(): string {
        return TrackFormat.toEditorCode(this.getDocument());
    }

    /**
     * Bytes of the track file, once every step is done.
     *
     * @param editor - Whether to keep the layers, as an editor file, else as a track code.
     */
    public getFile(editor: boolean): Uint8Array<ArrayBuffer> {
        return TrackFormat.encode(this.getDocument(), editor);
    }
}
