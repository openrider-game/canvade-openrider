import type { GroundPen } from '../ground-pen';
import type { SeededRandom } from '../seeded-random';
import type { SectionItemKind } from '../terrain.types';
import { drawObstacle, Obstacle, ObstacleOptions } from './obstacle';

/** Spacing and number of the reset items ending a zone, stacked high enough to catch a jump. */
const RESET_SPACING = 33,
    RESET_COUNT = 7;

/**
 * Zone of the terrain under a status effect, one per file of `zones/`, picked at random among
 * the zones of a version of the generator (see `versions.ts`). As the obstacles, a zone released
 * in a version never changes.
 */
export interface Zone {
    /** Name of the zone, unique in a version, shown by the debug overlay. */
    readonly name: string;
    /** Item starting the zone, giving its status effect. */
    readonly effect: SectionItemKind;
    /** How often the zone comes at a difficulty, among the zones; 0 for never. */
    weight(d: number): number;
    /** Draws the terrain of the zone, between its effect and the reset items ending it. */
    drawInside(pen: GroundPen, d: number, random: SeededRandom): void;
}

/** A zone of two or three obstacles picked at random among its own, drawn with its options. */
export function obstacleZone(zone: {
    name: string;
    effect: SectionItemKind;
    weight: (d: number) => number;
    obstacles: readonly Obstacle[];
    options: ObstacleOptions;
}): Zone {
    const { name, effect, weight, obstacles, options } = zone;
    return {
        name,
        effect,
        weight,
        drawInside: (pen, d, random) => {
            for (let count = random.int(2, 3); count > 0; count--) {
                const obstacle = obstacles[random.int(0, obstacles.length - 1)];
                drawObstacle(pen, obstacle, d, random, options);
            }
        },
    };
}

/**
 * Draws a zone: the effect at its start, its terrain, then a column of reset items, high enough
 * to catch a bike jumping over them.
 */
export function drawZone(pen: GroundPen, zone: Zone, d: number, random: SeededRandom): void {
    pen.lineTo(pen.x + 60, pen.y);
    // At the height of the wheels and of the rider
    pen.addItem(zone.effect, pen.x, pen.y - 12);
    pen.addItem(zone.effect, pen.x, pen.y - 45);
    pen.lineTo(pen.x + 80, pen.y);

    zone.drawInside(pen, d, random);

    pen.lineTo(pen.x + 60, pen.y);
    for (let reset = 0; reset < RESET_COUNT; reset++) {
        pen.addItem('reset', pen.x, pen.y - 12 - RESET_SPACING * reset);
    }
    pen.lineTo(pen.x + 80, pen.y);
}
