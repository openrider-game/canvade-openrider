import type { TrackObject } from '../item/track-object';
import type { Track } from './track';
import { TrackLayer, TrackLayerType } from './track-layer';

/** Default names of the layers, numbered when they are added in the editor. */
const LAYER_NAMES: Record<TrackLayerType, string> = {
    main: 'Main',
    foreground: 'Foreground',
};

/**
 * Ordered layers of a track, from the bottom one to the top one, and the active layer of the
 * editor.
 *
 * The main layers are drawn under the bikes and the foreground layers over them, each group in
 * stack order. There is always at least one main layer. Adding, removing, moving and renaming
 * layers can be undone; showing or hiding them cannot, as it does not change the track.
 */
export class LayerStack {
    private list: TrackLayer[] = [];
    /** Layer the editor tools draw on. */
    public active: TrackLayer;

    public constructor(private readonly track: Track) {
        this.active = this.reset([
            new TrackLayer('main', LAYER_NAMES.main),
            new TrackLayer('foreground', LAYER_NAMES.foreground),
        ]);
    }

    /** Every layer, from the bottom one to the top one. */
    public get all(): readonly TrackLayer[] {
        return this.list;
    }

    /** Main layers, from the bottom one to the top one. */
    public get main(): TrackLayer[] {
        return this.list.filter((layer) => layer.type === 'main');
    }

    /** Foreground layers, from the bottom one to the top one. */
    public get foreground(): TrackLayer[] {
        return this.list.filter((layer) => layer.type === 'foreground');
    }

    /**
     * Replaces every layer, e.g. with the layers of a parsed track, without history.
     *
     * @returns The new active layer: the first main layer.
     * @throws When there is no main layer.
     */
    public reset(layers: TrackLayer[]): TrackLayer {
        const firstMain = layers.find((layer) => layer.type === 'main');
        if (!firstMain) {
            throw new Error('A track needs at least one main layer');
        }

        this.list = [...layers];
        this.active = firstMain;
        return firstMain;
    }

    /**
     * Layer receiving the items, which only work on main layers: the active layer when it is a
     * main layer, otherwise the closest main layer under it, otherwise the first main layer.
     */
    public get itemLayer(): TrackLayer {
        const index = this.list.indexOf(this.active);
        for (let i = index; i >= 0; i--) {
            if (this.list[i].type === 'main') {
                return this.list[i];
            }
        }
        return this.main[0];
    }

    /** Shows a layer that a tool is about to draw on, so that the drawing is not invisible. */
    public reveal(layer: TrackLayer): TrackLayer {
        if (!layer.visible) {
            layer.visible = true;
            this.track.invalidateUI();
        }
        return layer;
    }

    public setActive(layer: TrackLayer): void {
        if (this.list.includes(layer)) {
            this.active = layer;
            this.track.invalidateUI();
        }
    }

    public setVisible(layer: TrackLayer, visible: boolean): void {
        layer.visible = visible;
        this.track.invalidateUI();
    }

    /**
     * Adds an empty layer above the active layer and makes it active.
     *
     * @param name - Name of the layer, numbered after its type by default.
     */
    public add(type: TrackLayerType, name = this.nextName(type)): TrackLayer {
        const layer = new TrackLayer(type, name);
        const index = this.list.indexOf(this.active) + 1;
        const previous = this.active;

        this.insert(layer, index);
        this.track.history.push({
            undo: () => {
                this.detach(layer);
                this.setActive(previous);
            },
            redo: () => this.insert(layer, index),
        });

        return layer;
    }

    /**
     * Removes a layer with its objects.
     *
     * @returns Whether the layer was removed: the last main layer cannot be.
     */
    public remove(layer: TrackLayer): boolean {
        const index = this.list.indexOf(layer);
        if (index < 0 || (layer.type === 'main' && this.main.length === 1)) {
            return false;
        }

        // Removed from the track, so that its items no longer count (targets...)
        const objects = layer.objects();
        const wasActive = this.active === layer;
        const remove = () => {
            objects.forEach((obj) => obj.removeFromTrack());
            this.detach(layer);
        };

        remove();
        this.track.history.push({
            undo: () => {
                this.list.splice(index, 0, layer);
                objects.forEach((obj: TrackObject) => obj.addToTrack());
                if (wasActive) {
                    this.active = layer;
                }
                this.track.invalidateUI();
            },
            redo: remove,
        });

        return true;
    }

    /**
     * Moves a layer up (towards the top of the stack) or down.
     *
     * @param offset - Number of positions, positive to move up.
     */
    public move(layer: TrackLayer, offset: number): void {
        const from = this.list.indexOf(layer);
        const to = Math.max(0, Math.min(this.list.length - 1, from + offset));
        if (from < 0 || from === to) {
            return;
        }

        const moveTo = (target: number) => {
            this.list.splice(this.list.indexOf(layer), 1);
            this.list.splice(target, 0, layer);
            this.track.invalidateUI();
        };

        moveTo(to);
        this.track.history.push({ undo: () => moveTo(from), redo: () => moveTo(to) });
    }

    /** Renames a layer, ignoring blank names. */
    public rename(layer: TrackLayer, name: string): void {
        const newName = name.trim();
        const oldName = layer.name;
        if (!newName || newName === oldName) {
            return;
        }

        const setName = (value: string) => {
            layer.name = value;
            this.track.invalidateUI();
        };

        setName(newName);
        this.track.history.push({ undo: () => setName(oldName), redo: () => setName(newName) });
    }

    private insert(layer: TrackLayer, index: number): void {
        this.list.splice(index, 0, layer);
        this.active = layer;
        this.track.invalidateUI();
    }

    /** Takes a layer out of the stack, activating the layer under it (or above it) if needed. */
    private detach(layer: TrackLayer): void {
        const index = this.list.indexOf(layer);
        this.list.splice(index, 1);
        if (this.active === layer) {
            this.active = this.list[Math.max(0, index - 1)];
        }
        this.track.invalidateUI();
    }

    /** First unused `<type name> <n>` name. */
    private nextName(type: TrackLayerType): string {
        const names = new Set(this.list.map((layer) => layer.name));
        let index = this.list.filter((layer) => layer.type === type).length + 1;
        while (names.has(`${LAYER_NAMES[type]} ${index}`)) {
            index++;
        }
        return `${LAYER_NAMES[type]} ${index}`;
    }
}
