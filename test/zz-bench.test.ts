import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { TrackFormat } from '../src/openrider/parser/track-format';
import { TrackParser } from '../src/openrider/parser/track-parser';
import { Track } from '../src/openrider/track/track';
import { stubBrowser } from './helpers/canvas';
import { seededRandom } from './helpers/track';

// Temporary benchmark of the load of a track of a million lines, deleted afterwards
setFlagsFromString('--expose_gc');
const gc = runInNewContext('gc') as () => void;
const heap = () => {
    gc();
    gc();
    return process.memoryUsage().heapUsed;
};

test('bench', () => {
    stubBrowser();
    const random = seededRandom(3);
    const solid: number[][] = [];
    let x = 0;
    for (let p = 0; p < 111_112; p++) {
        const polyline: number[] = [];
        let y = Math.round(random() * 2000);
        for (let k = 0; k < 10; k++) {
            polyline.push(x, y);
            x += 5 + Math.round(random() * 20);
            y += Math.round(random() * 20 - 10);
        }
        solid.push(polyline);
        x -= 200;
    }
    const code = TrackFormat.toTrackCode({
        layers: [
            { name: 'Main', type: 'main', visible: true, solid, scenery: [], items: [{ code: 'T', values: [0, 0] }] },
            { name: 'Foreground', type: 'foreground', visible: true, solid: [], scenery: [], items: [] },
        ],
        bike: 'BMX',
        origin: { x: 0, y: 0 },
    });
    const out: string[] = [];
    const before = heap();
    const track = new Track(null, process.env.HEADLESS === '1');
    const parser = new TrackParser(track);
    let t = performance.now();
    parser.init(code);
    out.push(`init ${(performance.now() - t).toFixed(0)} ms`);
    t = performance.now();
    while (!parser.done) parser.currentStep();
    out.push(`steps ${(performance.now() - t).toFixed(0)} ms`);
    const after = heap();
    out.push(`${((after - before) / 1_000_008).toFixed(0)} B/line`);
    writeFileSync(process.env.TEMP + '/load-bench.txt', out.join(', ') + '\n', { flag: 'a' });
    (globalThis as Record<string, unknown>).keep = track;
}, 600000);
