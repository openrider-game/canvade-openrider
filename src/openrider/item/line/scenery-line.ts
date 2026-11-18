import { Line } from './line';

/**
 * Decorative line, rendered in its color (see {@link Line.color} and `SCENERY_COLORS`) and
 * ignored by the physics.
 */
export class SceneryLine extends Line {
    public get kind(): 'scenery' {
        return 'scenery';
    }

    protected onAdd(): void {
        this.grid.totalSceneryLines.set(this.id, this);
    }

    protected onDelete(): void {
        this.grid.totalSceneryLines.delete(this.id);
    }
}
