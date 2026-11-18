import { Vector } from 'canvade';
import { Line } from './line';
import { LineStore } from './line-store';

/**
 * Decorative line, rendered in its color (see {@link Line.color} and `SCENERY_COLORS`) and
 * ignored by the physics.
 */
export class SceneryLine extends Line {
    public get kind(): 'scenery' {
        return 'scenery';
    }

    protected onAdd(): void {
        this.grid.totalSceneryLines.added(this);
    }

    protected onDelete(): void {
        this.grid.totalSceneryLines.removed();
    }
}

LineStore.factories.scenery = (track, slot) =>
    Line.bindSlot(new SceneryLine(new Vector(), new Vector(), track), slot);
