import type { PhysicsCell } from '../grid/cell/physics-cell';
import type { Grid } from '../grid/grid';
import type { Item } from '../item/item';
import { type LineStore, RECORDED } from '../item/line/line-store';
import type { Track } from '../track/track';
import type { TrackLayer } from '../track/track-layer';
import {
    addScenery,
    type LayerDocument,
    type Polyline,
    type TrackDocument,
} from './track-document';
import { TrackFormat } from './track-format';

/** Section of a layer being serialized: its lines by slot, or its items. */
interface GeneratorData {
    length: number;
    index: number;
    /** Adds the entry of an index to the layer document, unless recorded already. */
    record(index: number): void;
    /** Clears the recorded flags of the entries, once the track is serialized. */
    reset(): void;
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
        const store = track.lineStore;
        this.sections = this.layers.flatMap(({ layer, document }) => [
            TrackGenerator.lineSection(store, layer, false, (polyline) =>
                document.solid.push(polyline),
            ),
            TrackGenerator.lineSection(store, layer, true, (polyline, color) =>
                addScenery(document.scenery, color, [polyline]),
            ),
            TrackGenerator.itemSection([...layer.grid.totalObjects.values()], (item) =>
                document.items.push(item.toEntity()),
            ),
        ]);
        this.length = this.sections.reduce((total, data) => total + data.length, 0);
    }

    /** Section of the lines of a kind of a layer, read from the store by slot. */
    private static lineSection(
        store: LineStore,
        layer: TrackLayer,
        scenery: boolean,
        record: (polyline: Polyline, color: number) => void,
    ): GeneratorData {
        const totals = scenery ? layer.grid.totalSceneryLines : layer.grid.totalSolidLines;
        const slots = Array.from(totals.slots());
        return {
            length: slots.length,
            index: 0,
            record: (index) => {
                const slot = slots[index];
                if (!(store.flags[slot] & RECORDED)) {
                    record(
                        TrackGenerator.polyline(store, layer.grid, slot, scenery),
                        store.color[slot],
                    );
                }
            },
            reset: () => slots.forEach((slot) => (store.flags[slot] &= ~RECORDED)),
        };
    }

    /** Section of the items of a layer. */
    private static itemSection(items: Item[], record: (item: Item) => void): GeneratorData {
        return {
            length: items.length,
            index: 0,
            record: (index) => {
                if (!items[index].recorded) {
                    record(items[index]);
                }
            },
            reset: () => items.forEach((item) => (item.recorded = false)),
        };
    }

    /**
     * Points of the line of a slot followed by the lines connected after it, of the same kind and
     * color, not recorded yet, rounded, as `Line.toPolyline` writes them: every chained line is
     * marked as recorded, so that it is not exported again on its own.
     */
    private static polyline(
        store: LineStore,
        grid: Grid<PhysicsCell>,
        first: number,
        scenery: boolean,
    ): Polyline {
        const polyline = [Math.round(store.x1[first]), Math.round(store.y1[first])];
        const kind = scenery ? 'scenery' : 'solid';
        const color = store.color[first];
        for (let slot = first; slot >= 0;) {
            store.flags[slot] |= RECORDED;
            const [endX, endY] = [store.x2[slot], store.y2[slot]];
            polyline.push(Math.round(endX), Math.round(endY));
            const cell = grid.existing(
                Math.floor(endX / grid.cellSize),
                Math.floor(endY / grid.cellSize),
            );
            slot = cell ? cell.searchSlot(endX, endY, kind, color) : -1;
        }
        return polyline;
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

        const l = Math.min(data.index + STEP_SIZE, data.length);
        for (; data.index < l; data.index++) {
            data.record(data.index);
        }

        if (data.index >= data.length) {
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
            data.reset();
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

    /**
     * Track file of the track, its layers of each type merged (a track code), once every step is
     * done.
     */
    public getCode(): Uint8Array<ArrayBuffer> {
        return TrackFormat.encode(this.getDocument(), false);
    }

    /** Track file of the track keeping its layers (an editor file), once every step is done. */
    public getEditorCode(): Uint8Array<ArrayBuffer> {
        return TrackFormat.encode(this.getDocument(), true);
    }
}
