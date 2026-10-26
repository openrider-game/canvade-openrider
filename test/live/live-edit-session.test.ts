import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TrackEditor } from '../../src/openrider/edit/track-editor';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Target } from '../../src/openrider/item/reachable/target';
import { LiveEditSession } from '../../src/openrider/live/live-edit-session';
import { TrackGenerator } from '../../src/openrider/parser/track-generator';
import type { Track } from '../../src/openrider/track/track';
import { LiveLimits, LiveServer } from '../../server/live/live-server';
import { signToken } from '../../server/live/token';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

const SECRET = 'test-secret';
/** Track of the first editor: lines, items, a linked pair and a foreground layer. */
const TRACK_CODE = '0 0 a 0 k 0,0 a a a#0 -a a -a#T 5 5,W 8 8 9 9#0 1 a 1#0 2 a 2#BMX#a -5';

let server: LiveServer;
let url: string;
const sessions: LiveEditSession[] = [];

async function start(limits: Partial<LiveLimits> = {}): Promise<void> {
    server = new LiveServer({
        secret: SECRET,
        loadTrackCode: async () => '',
        verify: async () => ({ valid: false, reason: '' }),
        limits,
        log: () => {},
    });
    url = `ws://127.0.0.1:${await server.listen(0)}/live/`;
}

beforeEach(() => {
    stubBrowser();
});

afterEach(async () => {
    sessions.splice(0).forEach((session) => session.stop());
    await server?.close();
    vi.unstubAllGlobals();
});

/** Joins the editing session with a track, as the editing state does. */
function join(rider: string, track: Track): LiveEditSession {
    const token = signToken(
        {
            session: 'edit-1',
            track: 'edit',
            rider,
            name: rider.slice(1),
            exp: Date.now() / 1000 + 60,
        },
        SECRET,
    );
    const session = LiveEditSession.start(track, url, token);
    sessions.push(session);
    return session;
}

/** Lets the sessions send their edits and receive those of the others, until a condition. */
async function until(condition: () => boolean, tracks: Track[]): Promise<void> {
    for (let i = 0; i < 300 && !condition(); i++) {
        tracks.forEach((track) => LiveEditSession.of(track)?.update(200));
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(condition()).toBe(true);
}

/** Lets every message go, a few rounds after the last one. */
async function settle(tracks: Track[]): Promise<void> {
    for (let i = 0; i < 20; i++) {
        tracks.forEach((track) => LiveEditSession.of(track)?.update(200));
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

/** Content of a track as exported, sorted, see the tests of the editor. */
function content(track: Track) {
    const generator = new TrackGenerator(track);
    while (!generator.done) {
        generator.currentStep();
    }
    const segments = (polylines: string) =>
        polylines
            .split(',')
            .filter(Boolean)
            .flatMap((polyline) => {
                const points = polyline.split(' ');
                return points
                    .slice(0, -2)
                    .flatMap((_, i) => (i % 2 ? [] : [points.slice(i, i + 4).join(' ')]));
            })
            .sort();
    const document = generator.getDocument();
    return {
        origin: document.origin,
        layers: document.layers.map((layer) => ({
            name: layer.name,
            type: layer.type,
            solid: segments(layer.solid),
            scenery: segments(layer.scenery),
            items: layer.items.split(',').filter(Boolean).sort(),
        })),
    };
}

/** Ids of the objects of each grid cell in their order, the collisions depending on it. */
function cells(track: Track): string[] {
    return track.layers.all.flatMap((layer) =>
        [...layer.grid.cells.entries()]
            .map(([key, cell]) => {
                const objects = [...cell.lines, ...cell.scenery, ...cell.objects];
                return `${layer.uid}/${key}:${objects.map((o) => TrackEditor.unitOf(o).uid).join(' ')}`;
            })
            .filter((entry) => !entry.endsWith(':'))
            .sort(),
    );
}

function line(
    track: Track,
    from: [number, number],
    to: [number, number],
    layer = track.layers.active,
) {
    const object = new SolidLine(new Vector(...from), new Vector(...to), track);
    object.layer = layer;
    return object;
}

describe('Live edit session', () => {
    test('edits a track together, every screen ending with the same track', async () => {
        await start();
        const ann = parseTrack(TRACK_CODE);
        const bob = parseTrack('-50 1i 2000 1i#####BMX#0 0');
        const annSession = join('uann', ann);
        await until(() => annSession.state.loaded, [ann]);
        const bobSession = join('ubob', bob);
        await until(() => bobSession.state.loaded, [ann, bob]);

        // Bob gets the track of Ann, the first editor, the host of the session
        expect(content(bob)).toEqual(content(ann));
        expect(annSession.isHost).toBe(true);
        expect(bobSession.isHost).toBe(false);

        // Both edit at once: lines on the same spot, items, erasing, the same layer renamed and
        // moved by both, the start position, undoing
        ann.editor.add([line(ann, [0, 50], [100, 50]), line(ann, [100, 50], [150, 70])]);
        bob.editor.add([line(bob, [0, 50], [100, 50]), line(bob, [50, 40], [50, 80])]);
        const target = new Target(new Vector(20, 20), bob);
        target.layer = bob.layers.itemLayer;
        bob.editor.add([target]);
        const erased = ann.checkDelete(
            new Vector(8, 8),
            2,
            { solid: false, scenery: false, item: true },
            ann.layers.main,
        );
        ann.editor.recordRemoved(erased);
        ann.layers.rename(ann.layers.foreground[0], 'Ann');
        bob.layers.rename(bob.layers.foreground[0], 'Bob');
        bob.layers.move(bob.layers.foreground[0], -1);
        ann.editor.moveOrigin(new Vector(40, -60));
        const upper = bob.layers.add('main');
        bob.editor.add([line(bob, [0, 200], [80, 200], upper)]);
        bob.history.undo();
        await settle([ann, bob]);

        expect(content(bob)).toEqual(content(ann));
        expect(cells(bob)).toEqual(cells(ann));
        expect(content(ann).layers.map((layer) => layer.name)).toContain('Bob');
        expect(content(ann).origin).toBe(new Vector(40, -60).toString());
        // The line undone by Bob is gone on both screens
        expect(content(ann).layers.flatMap((layer) => layer.solid)).not.toContain('0 68 2g 68');
    });

    test('gives a screen joining late the whole track, also after starting again from one', async () => {
        await start({ compactEdits: 5 });
        const ann = parseTrack(TRACK_CODE);
        join('uann', ann);
        await until(() => LiveEditSession.of(ann)?.state.loaded === true, [ann]);
        for (let i = 0; i < 12; i++) {
            ann.editor.add([line(ann, [i * 10, 300], [i * 10 + 8, 310])]);
            await settle([ann]);
        }

        const cid = parseTrack('-50 1i 2000 1i#####BMX#0 0');
        const cidSession = join('ucid', cid);
        await until(() => cidSession.state.loaded, [ann, cid]);
        await settle([ann, cid]);

        expect(content(cid)).toEqual(content(ann));
        expect(cells(cid)).toEqual(cells(ann));
    });

    test('shows the cursors of the others, and signs the accounts that edited', async () => {
        await start();
        const ann = parseTrack(TRACK_CODE);
        const bob = parseTrack(TRACK_CODE);
        const annSession = join('uann', ann);
        await until(() => annSession.state.loaded, [ann]);
        const bobSession = join('ubob', bob);
        await until(
            () => bobSession.state.loaded && annSession.state.editors.length === 2,
            [ann, bob],
        );

        ann.mouseIn = true;
        ann.mousePos.set(new Vector(120, 40));
        ann.editor.add([line(ann, [0, 50], [100, 50])]);
        await until(() => bobSession.credits !== null, [ann, bob]);
        await settle([ann, bob]);

        const cursors = (bobSession as unknown as { cursors: Map<string, Vector> }).cursors;
        expect(cursors.get('uann')).toEqual(new Vector(120, 40));
        const [payload] = (bobSession.credits ?? '').split('.');
        expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
            session: 'edit-1',
            host: 'uann',
            authors: ['uann'],
        });

        // Out of the track: the cursor is gone
        ann.mouseIn = false;
        await settle([ann, bob]);
        expect(cursors.has('uann')).toBe(false);
    });

    test('refuses the guests', async () => {
        await start();
        const guest = join('g123', parseTrack(TRACK_CODE));
        await until(() => guest.state.state === 'closed', []);
        expect(guest.state.message).toBe('Log in to edit the track together');
    });
});
