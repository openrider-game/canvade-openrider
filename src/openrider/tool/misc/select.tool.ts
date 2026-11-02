import { Control, DELETE, BACKSPACE, ESCAPE, KEYS, Vector } from 'canvade';
import { MAX_SELECTED_OBJECTS } from '../../edit/edit-limits';
import { ClipObject, ObjectClipboard } from '../../edit/object-clipboard';
import { ObjectTransform } from '../../edit/object-transform';
import { unitOf } from '../../edit/edit-objects';
import { LinkedItemGroup } from '../../item/linked-item-group';
import type { TrackObject } from '../../item/track-object';
import type { TemplateSummary } from '../../request/template-service';
import { Tool, ToolOption } from '../tool';
import {
    type Area,
    drawArea,
    drawCrosshair,
    drawHandle,
    drawObjects,
    objectsArea,
    SELECTION_COLOR,
} from './selection-drawing';
import { TemplateBrowser } from './template-browser';

/** Distance of the rotation handle above the selection, in canvas pixels at zoom 1. */
const HANDLE_DISTANCE = 30,
    /** Distance under which a press takes the rotation handle, in canvas pixels. */
    HANDLE_REACH = 14,
    /** Drags shorter than this, in canvas pixels, are clicks: clearing the selection. */
    CLICK_DISTANCE = 4;

/** What the pointer pressed does until released. */
type Gesture = 'none' | 'select' | 'move' | 'rotate' | 'place';

/**
 * Selects the objects of an area of the active layer, to move, turn, copy, cut, delete or paste
 * them, and to save them as a template.
 *
 * Dragging selects the objects fully inside the rectangle dragged, at most
 * {@link MAX_SELECTED_OBJECTS}. Dragging the selection moves it, dragging the handle above it
 * turns it freely around its center: the objects are replaced when released, as a single edit
 * (see `ObjectTransform` for what moves with them, e.g. a command block without its area). The
 * options drawer copies, cuts, deletes and pastes, the way to do it without a keyboard; with one,
 * Ctrl+C, Ctrl+X and Ctrl+V go through the clipboard of the browser, so that objects are pasted
 * from another track too, Delete deletes and Escape lets go of the selection or of the objects
 * being pasted.
 *
 * Objects being pasted follow the pointer, placed where it is released, then selected.
 *
 * With the website, the selection is saved as a template, and the templates are listed in the
 * options to paste one, see {@link TemplateBrowser}. The drawing of the selection is in
 * `selection-drawing.ts`.
 */
export class SelectTool extends Tool {
    public static override readonly toolName: string = 'Select';
    public static override readonly key = new Control(KEYS);
    public static override readonly icon = 'select';

    /** Shown without a pointer too, e.g. after a finger lifted. */
    public override alwaysRender = true;

    private selection: TrackObject[] = [];
    private gesture: Gesture = 'none';
    /** Pointer position where the gesture started, in world units. */
    private start = new Vector();
    /** Objects being pasted, not on the track, around (0, 0); null while not pasting. */
    private pasting: TrackObject[] | null = null;
    /** Message of the last action, e.g. a selection too large, shown in the options. */
    private notice: string | null = null;
    private readonly templates = new TemplateBrowser(this.track, {
        notify: (notice) => (this.notice = notice),
        paste: (objects) => this.paste(objects),
    });

    /** Selected objects still on the track: undoing, or another editor, may remove some. */
    public get selected(): readonly TrackObject[] {
        this.selection = this.selection.filter((object) => object.onTrack);
        return this.selection;
    }

    /** Objects being pasted, null while not pasting. */
    public get pasted(): readonly TrackObject[] | null {
        return this.pasting;
    }

    public override deactivate(): void {
        super.deactivate();
        this.gesture = 'none';
        this.pasting = null;
        this.selection = [];
        this.notice = null;
        this.templates.close();
    }

    public override onMouseDown(e: MouseEvent): void {
        super.onMouseDown(e);
        this.start = this.track.mousePos.clone();
        if (this.pasting) {
            this.gesture = 'place';
        } else if (this.nearHandle()) {
            this.gesture = 'rotate';
        } else if (this.selected.length && this.inSelection(this.start)) {
            this.gesture = 'move';
        } else {
            this.gesture = 'select';
        }
    }

    public override onMouseUp(e: MouseEvent): void {
        if (!this.mouseDown) {
            return;
        }
        super.onMouseUp(e);
        const gesture = this.gesture;
        this.gesture = 'none';

        if (gesture === 'select') {
            this.selectArea();
        } else if (gesture === 'move' || gesture === 'rotate') {
            this.transformSelection(this.gestureTransform(gesture));
        } else if (gesture === 'place') {
            this.place();
        }
        this.track.invalidateUI();
    }

    /** Selects the objects of the area dragged, a click letting go of the selection. */
    private selectArea(): void {
        const area = this.dragArea();
        this.selection = [];
        this.notice = null;
        if (!area) {
            return;
        }
        const objects = this.track.commands.objectsIn(this.track.layers.active, area);
        if (objects.length > MAX_SELECTED_OBJECTS) {
            this.notice = `Too many objects: ${objects.length} / ${MAX_SELECTED_OBJECTS}`;
            return;
        }
        this.selection = objects;
    }

    /** Area dragged from the start of the gesture, null for a click. */
    private dragArea(): Area | null {
        const { start } = this;
        const end = this.track.mousePos;
        const click = CLICK_DISTANCE / this.track.zoomFactor;
        if (Math.abs(end.x - start.x) < click && Math.abs(end.y - start.y) < click) {
            return null;
        }
        return {
            left: Math.min(start.x, end.x),
            top: Math.min(start.y, end.y),
            right: Math.max(start.x, end.x),
            bottom: Math.max(start.y, end.y),
        };
    }

    /** Transform of the selection while moving or turning it, from the start of the gesture. */
    private gestureTransform(gesture: Gesture): ObjectTransform {
        const pointer = this.track.mousePos;
        if (gesture === 'move') {
            const offset = pointer.sub(this.start);
            return ObjectTransform.move(new Vector(Math.round(offset.x), Math.round(offset.y)));
        }
        if (gesture === 'rotate') {
            const pivot = this.pivot();
            const angle =
                Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) -
                Math.atan2(this.start.y - pivot.y, this.start.x - pivot.x);
            return new ObjectTransform(pivot, angle, new Vector());
        }
        return ObjectTransform.NONE;
    }

    /**
     * Replaces the selection with its objects transformed, as a single edit, then selects them:
     * the items of a linked group moving alone when the others are not selected.
     */
    public transformSelection(transform: ObjectTransform): void {
        const selected = this.selected;
        if (transform.isIdentity || !selected.length) {
            return;
        }

        const units = new Map<TrackObject, Set<TrackObject>>();
        for (const object of selected) {
            const unit = unitOf(object);
            units.set(unit, (units.get(unit) ?? new Set()).add(object));
        }
        const entries = [...units];
        const added = this.track.editor.replace(
            entries.map(([unit, parts]) => ({ object: unit, code: transform.code(unit, parts) })),
        );

        // The same objects selected, as replaced: the same items of each linked group
        this.selection = added.flatMap((object, i) => {
            const [unit, parts] = entries[i];
            if (unit instanceof LinkedItemGroup && object instanceof LinkedItemGroup) {
                return unit.instances.flatMap((instance, index) =>
                    parts.has(instance) && object.instances[index] ? [object.instances[index]] : [],
                );
            }
            return [object];
        });
    }

    /** Copies the selection, see `ObjectClipboard.copy`. */
    public copy(): ClipObject[] {
        const copied = ObjectClipboard.copy(this.selected);
        if (copied.length) {
            ObjectClipboard.content = copied;
            this.notice = `Copied ${copied.length} objects`;
            // Also to the clipboard of the device when it allows it, e.g. for another tab
            navigator.clipboard?.writeText(ObjectClipboard.toText(copied)).catch(() => {});
        }
        this.track.invalidateUI();
        return copied;
    }

    /** Copies the selection, then deletes it. */
    public cut(): void {
        if (this.copy().length) {
            this.delete();
        }
    }

    /** Removes the selected objects, as an edit that can be undone. */
    public delete(): void {
        const selected = this.selected;
        if (selected.length) {
            this.track.editor.remove(selected);
        }
        this.selection = [];
        this.track.invalidateUI();
    }

    /**
     * Starts pasting objects: they follow the pointer until placed. Too many objects, or none,
     * are refused with a notice.
     */
    public paste(objects: readonly ClipObject[] = ObjectClipboard.content): void {
        if (objects.length > MAX_SELECTED_OBJECTS) {
            this.notice = `Too many to paste: ${objects.length} / ${MAX_SELECTED_OBJECTS}`;
        } else if (!objects.length) {
            this.notice = 'Nothing to paste';
        } else {
            this.pasting = ObjectClipboard.instantiate(objects, this.track);
            this.selection = [];
            this.notice = null;
        }
        this.track.invalidateUI();
    }

    /** Places the objects being pasted around the pointer, on the active layer, then selects them. */
    private place(): void {
        const pasting = this.pasting;
        if (!pasting) {
            return;
        }
        const layers = this.track.layers;
        const layer = layers.reveal(layers.active);
        const transform = ObjectTransform.move(this.roundedPointer());
        const added = this.track.editor.addCodes(
            pasting.map((object) => ({
                layer: layer.uid,
                kind: object.kind,
                code: transform.code(object),
            })),
        );
        this.pasting = null;
        this.selection = added.flatMap((object) =>
            object instanceof LinkedItemGroup ? object.instances : [object],
        );
    }

    public override onClipboard(name: 'copy' | 'cut' | 'paste', e: ClipboardEvent): boolean {
        if (name === 'paste') {
            const text = e.clipboardData?.getData('text/plain') ?? '';
            // A track code pasted, else the objects copied on this page
            const objects = ObjectClipboard.fromText(text);
            if (objects === null && !ObjectClipboard.content.length) {
                return false;
            }
            this.paste(objects ?? ObjectClipboard.content);
            return true;
        }

        if (!this.selected.length) {
            return false;
        }
        const copied = name === 'cut' ? (this.cut(), ObjectClipboard.content) : this.copy();
        e.clipboardData?.setData('text/plain', ObjectClipboard.toText(copied));
        return true;
    }

    public override onKeyDown(e: KeyboardEvent): boolean {
        if ((e.key === DELETE || e.key === BACKSPACE) && this.selected.length) {
            this.delete();
            return true;
        }
        if (e.key === ESCAPE && (this.pasting || this.selected.length)) {
            this.cancel();
            return true;
        }
        return false;
    }

    /** Saves the selection as a template, see `TemplateBrowser.save`. */
    public saveTemplate(): Promise<void> {
        return this.templates.save(this.selected);
    }

    /** Lists the templates in the options, see `TemplateBrowser.browse`. */
    public browseTemplates(): Promise<void> {
        return this.templates.browse();
    }

    /** Pastes a template, see `TemplateBrowser.insert`. */
    public insertTemplate(template: TemplateSummary): Promise<void> {
        return this.templates.insert(template);
    }

    /** Lets go of the objects being pasted and of the selection. */
    public cancel(): void {
        this.pasting = null;
        this.selection = [];
        this.track.invalidateUI();
    }

    public override getOptions(): ToolOption[] {
        const options: ToolOption[] = [];
        if (this.notice) {
            options.push({ label: this.notice });
        }

        if (this.pasting) {
            options.push(
                { label: `Pasting ${this.pasting.length} objects: tap to place` },
                { label: 'Cancel', action: () => this.cancel() },
            );
            return options;
        }
        if (this.templates.browsing) {
            return [...options, ...this.templates.listOptions()];
        }

        const count = this.selected.length;
        if (count) {
            options.push(
                { label: `Selected: ${count} objects` },
                { label: 'Copy', action: () => this.copy() },
                { label: 'Cut', action: () => this.cut() },
                { label: 'Delete', action: () => this.delete() },
            );
        } else {
            options.push({ label: 'Drag to select' });
        }
        if (ObjectClipboard.content.length) {
            options.push({ label: 'Paste', action: () => this.paste() });
        }
        if (count) {
            options.push(...this.templates.saveOptions(() => this.selected));
        }
        options.push({ label: 'Templates', action: () => void this.browseTemplates() });
        return options;
    }

    /** Pointer position in whole world units, where the objects pasted are centered. */
    private roundedPointer(): Vector {
        const { x, y } = this.track.mousePos;
        return new Vector(Math.round(x), Math.round(y));
    }

    /** Center of the selection, the point it turns around. */
    private pivot(): Vector {
        const { left, top, right, bottom } = objectsArea(this.selected);
        return new Vector((left + right) / 2, (top + bottom) / 2);
    }

    /** Position of the rotation handle, above the selection, in world units. */
    private handle(): Vector {
        const { left, top, right } = objectsArea(this.selected);
        return new Vector((left + right) / 2, top - HANDLE_DISTANCE / this.track.zoomFactor);
    }

    /** Whether a point, in world units, takes the rotation handle: by default the press. */
    private nearHandle(point = this.start): boolean {
        if (!this.selected.length) {
            return false;
        }
        const distance = this.track.toPixel(this.handle()).distanceTo(this.track.toPixel(point));
        return distance <= HANDLE_REACH * this.track.pixelRatio;
    }

    /** Whether a point is in the selection area, with a margin around single points. */
    private inSelection(point: Vector): boolean {
        const margin = 10 / this.track.zoomFactor;
        const { left, top, right, bottom } = objectsArea(this.selected);
        return (
            point.x >= left - margin &&
            point.x <= right + margin &&
            point.y >= top - margin &&
            point.y <= bottom + margin
        );
    }

    /**
     * Draws the selection, as it moves or turns while dragged, with its area and rotation handle;
     * the rectangle being dragged to select; the objects being pasted at the pointer; and a
     * crosshair at the pointer, telling what pressing there does: arrows over the selection, which
     * a drag moves, and the handle filled under the pointer, which a drag turns.
     */
    public override render(ctx: CanvasRenderingContext2D): void {
        const track = this.track;
        const pointer = track.mousePos;
        const hovering = !this.mouseDown && track.toolManager.showsPointer && !this.pasting;
        const overHandle = this.gesture === 'rotate' || (hovering && this.nearHandle(pointer));
        const overSelection =
            this.gesture === 'move' ||
            (hovering && !overHandle && this.selected.length > 0 && this.inSelection(pointer));
        ctx.save();
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = Math.max(2 * track.zoomFactor, 1.5);
        ctx.lineCap = 'round';

        const selected = this.selected;
        if (selected.length) {
            const transform = this.mouseDown
                ? this.gestureTransform(this.gesture)
                : ObjectTransform.NONE;
            const area = objectsArea(selected);
            drawObjects(ctx, track, selected, transform);
            drawArea(ctx, track, area, transform);
            if (this.gesture !== 'move') {
                drawHandle(ctx, track, this.handle(), area.top, transform, overHandle);
            }
        }

        if (this.gesture === 'select' && this.mouseDown) {
            const area = this.dragArea();
            if (area) {
                drawArea(ctx, track, area, ObjectTransform.NONE);
            }
        }

        if (this.pasting && (track.toolManager.showsPointer || this.mouseDown)) {
            drawObjects(ctx, track, this.pasting, ObjectTransform.move(this.roundedPointer()));
        }
        if (track.toolManager.showsPointer || this.mouseDown) {
            drawCrosshair(ctx, track, overSelection);
        }
        ctx.restore();
    }
}
