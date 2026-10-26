import { Control, KEYE } from 'canvade';
import type { EraserRestriction } from '../../grid/cell/physics-cell';
import type { TrackObjectKind } from '../../item/track-object';
import type { TrackLayer } from '../../track/track-layer';
import { Tool, ToolOption } from '../tool';

/** Labels of the object kinds in the options drawer. */
const KIND_LABELS: Record<TrackObjectKind, string> = {
    solid: 'Line',
    scenery: 'Scenery',
    item: 'Object',
};

/**
 * Erases the track objects under a circle around the mouse while the button is held.
 *
 * Everything erased during a drag is undone as a whole. Scrolling while holding the tool key
 * changes the eraser size, and the options drawer selects which kinds of objects are erased, and
 * whether on the active layer only or on every visible layer.
 */
export class EraserTool extends Tool {
    public static override readonly toolName: string = 'Eraser';
    public static override readonly key = new Control(KEYE);
    public static override readonly icon = 'eraser';

    /** Radius of the eraser, in world units. */
    private size = 15;
    private readonly minSize = 5;
    private readonly maxSize = 40;

    /** Kinds of objects erased. */
    private readonly restrict: EraserRestriction = { solid: true, scenery: true, item: true };
    /** Whether every visible layer is erased, instead of the active layer only. */
    private allLayers = false;

    public override onMouseDown(e: MouseEvent): void {
        super.onMouseDown(e);
        // Everything erased during a drag is restored together
        this.track.history.startGroup();
        this.onMouseMove(e);
    }

    public override onMouseUp(e: MouseEvent): void {
        super.onMouseUp(e);
        this.track.history.endGroup();
    }

    public override onMouseMove(e: MouseEvent): void {
        super.onMouseMove(e);
        if (this.mouseDown) {
            const deleted = this.track.checkDelete(
                this.track.mousePos,
                this.size,
                this.restrict,
                this.erasedLayers(),
            );
            if (deleted.length) {
                this.track.editor.recordRemoved(deleted);
            }
        }
    }

    public override onScroll(e: WheelEvent): void {
        if (this.isHolding()) {
            this.size = Math.max(
                this.minSize,
                Math.min(this.maxSize, this.size + 5 * -Math.sign(e.deltaY)),
            );
        } else {
            super.onScroll(e);
        }
    }

    /** Layers erased: the active layer, or every visible layer. */
    private erasedLayers(): readonly TrackLayer[] {
        const layers = this.track.layers;
        return this.allLayers ? layers.all.filter((layer) => layer.visible) : [layers.active];
    }

    public override getOptions(): ToolOption[] {
        const kinds: TrackObjectKind[] = ['solid', 'scenery', 'item'];

        return [
            {
                label: this.allLayers ? 'Layers: all visible' : 'Layers: active',
                action: () => {
                    this.allLayers = !this.allLayers;
                    this.track.invalidateUI();
                },
            },
            ...kinds.map((kind) => ({
                label: `${KIND_LABELS[kind]}: ${this.restrict[kind] ? 'active' : 'inactive'}`,
                action: () => {
                    this.restrict[kind] = !this.restrict[kind];
                    this.track.invalidateUI();
                },
            })),
        ];
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.track.mousePos);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.size * this.track.zoomFactor, 0, 2 * Math.PI, true);
        ctx.fillStyle = '#ffb6c1';
        ctx.fill();
    }
}
