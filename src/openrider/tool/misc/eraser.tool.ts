import { Control, KEYE } from 'canvade';
import type { TrackObjectKind } from '../../item/track-object';
import { TrackEraserRestriction } from '../../track/track';
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
 * changes the eraser size, and the options drawer selects which kinds of objects are erased on each
 * layer.
 */
export class EraserTool extends Tool {
    public static override readonly toolName: string = 'Eraser';
    public static override readonly keyLabel: string = 'E';
    public static override readonly key = new Control(KEYE);
    public static override readonly icon = 'eraser';

    /** Radius of the eraser, in world units. */
    private size = 15;
    private readonly minSize = 5;
    private readonly maxSize = 40;

    /** Kinds of objects erased on each layer. */
    private readonly restrict: TrackEraserRestriction = {
        // No objects in foreground
        foreground: { solid: true, scenery: true, item: false },
        main: { solid: true, scenery: true, item: true },
    };

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
            const deleted = this.track.checkDelete(this.track.mousePos, this.size, this.restrict);
            if (deleted.length) {
                this.track.history.push({
                    undo: () => deleted.forEach((obj) => obj.addToTrack()),
                    redo: () => deleted.forEach((obj) => obj.removeFromTrack()),
                });
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

    public override getOptions(): ToolOption[] {
        const layers: Array<[string, keyof TrackEraserRestriction, TrackObjectKind[]]> = [
            ['Foreground', 'foreground', ['solid', 'scenery']],
            ['Main', 'main', ['solid', 'scenery', 'item']],
        ];

        return layers.flatMap(([layerLabel, layer, kinds]) =>
            kinds.map((kind) => ({
                label:
                    `${layerLabel} ${KIND_LABELS[kind]}: ` +
                    (this.restrict[layer][kind] ? 'active' : 'inactive'),
                action: () => {
                    this.restrict[layer][kind] = !this.restrict[layer][kind];
                    this.track.invalidateUI();
                },
            })),
        );
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.track.mousePos);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.size * this.track.zoomFactor, 0, 2 * Math.PI, true);
        ctx.fillStyle = '#ffb6c1';
        ctx.fill();
    }
}
