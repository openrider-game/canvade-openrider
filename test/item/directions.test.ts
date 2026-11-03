import { describe, expect, test } from 'vitest';
import { direction, FIRST_ROTATION, ROTATIONS } from '../../src/openrider/numeric/directions';

describe('Directions of the directional items', () => {
    test('are those V8 computes, for every rotation of the table and beyond it', () => {
        // The tests run with Node, as the verifier of the server
        const computed = (rotation: number) => {
            const rad = (rotation * Math.PI) / 180;
            return [-Math.sin(rad), Math.cos(rad)];
        };
        for (let rotation = FIRST_ROTATION; rotation < FIRST_ROTATION + ROTATIONS; rotation++) {
            // Bit for bit, -0 included
            expect(direction(rotation)).toStrictEqual(computed(rotation));
        }
        for (const rotation of [FIRST_ROTATION - 1, FIRST_ROTATION + ROTATIONS, 12.5, -1000]) {
            expect(direction(rotation)).toStrictEqual(computed(rotation));
        }
    });
});
