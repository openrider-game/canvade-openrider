import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { Boost } from '../../src/openrider/item/directional/boost';
import { Gravity } from '../../src/openrider/item/directional/gravity';
import { Item } from '../../src/openrider/item/item';
import { LinkedItem } from '../../src/openrider/item/linked-item';
import { LinkedItemGroup } from '../../src/openrider/item/linked-item-group';
import { LinkedCheckpoint } from '../../src/openrider/item/linked/linked-checkpoint';
import { Teleporter } from '../../src/openrider/item/linked/teleporter';
import { SceneryLine } from '../../src/openrider/item/line/scenery-line';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Bomb } from '../../src/openrider/item/misc/bomb';
import { SlowMo } from '../../src/openrider/item/misc/slow-mo';
import { MODIFIERS } from '../../src/openrider/item/modifiers';
import { Checkpoint } from '../../src/openrider/item/reachable/checkpoint';
import { Target } from '../../src/openrider/item/reachable/target';
import { EngineOff } from '../../src/openrider/item/status/engine-off';
import { Invincibility } from '../../src/openrider/item/status/invincibility';
import { NoSteer } from '../../src/openrider/item/status/no-steer';
import { Reset } from '../../src/openrider/item/status/reset';
import { Slippery } from '../../src/openrider/item/status/slippery';
import { ZeroGravity } from '../../src/openrider/item/status/zero-gravity';
import { ITEM_MAP } from '../../src/openrider/item/item.constants';
import { Launcher, LAUNCH_STRENGTH } from '../../src/openrider/item/directional/launcher';
import { Mud, MUD_GRIP } from '../../src/openrider/item/misc/mud';
import { Heavy, HEAVY_GRAVITY_SCALE } from '../../src/openrider/item/status/heavy';
import { LowGravity, LOW_GRAVITY_SCALE } from '../../src/openrider/item/status/low-gravity';
import { Mirror } from '../../src/openrider/item/status/mirror';
import { Turbo, TURBO_ENGINE_SCALE } from '../../src/openrider/item/status/turbo';
import { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack, runTicks } from '../helpers/track';

let track: Track;

/** Places an item on the main layer of the track. */
function place<T extends Item>(item: T): T {
    item.layer = track.layers.main[0];
    item.addToTrack();
    return item;
}

/** The player bike, its hitbox standing on the given position. */
function playerAt(x: number, y: number) {
    const bike = track.playerRunner.instance;
    if (!bike) throw new Error('No player bike');
    bike.hitbox.pos.set(new Vector(x, y));
    return bike;
}

beforeEach(() => {
    stubBrowser();
    track = parseTrack('-50 1i 2000 1i#####BMX#0 0');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Reachable items', () => {
    test('a target is queued when touched, then reached on the next physics tick', () => {
        const target = place(new Target(new Vector(100, 0), track));
        const bike = playerAt(100, 0);

        target.touch(bike.hitbox);
        expect(target.reached).toBe(true);
        expect(track.playerRunner.actionQueue.get(target.id)).toBe(target);
        expect(track.playerRunner.targetsReached.size).toBe(0);

        track.playerRunner.fixedUpdate();
        expect(track.playerRunner.targetsReached.has(target.id)).toBe(true);
        expect(track.playerRunner.actionQueue.size).toBe(0);
    });

    test('items out of reach are not touched', () => {
        const target = place(new Target(new Vector(100, 0), track));

        target.touch(playerAt(150, 0).hitbox);

        expect(target.reached).toBe(false);
    });

    test('ghosts reach items without marking them as reached', () => {
        const target = place(new Target(new Vector(100, 0), track));
        const ghost = new GhostRunner(track, ',,,,,100,BMX,Ghost');
        ghost.createBike();
        const ghostBike = ghost.instance;
        if (!ghostBike) throw new Error('No ghost bike');
        ghostBike.hitbox.pos.set(new Vector(100, 0));

        target.touch(ghostBike.hitbox);
        ghost.fixedUpdate();

        expect(target.reached).toBe(false);
        expect(ghost.targetsReached.has(target.id)).toBe(true);
        // The track has a single target: the ghost finished its run
        expect(ghost.done).toBe(true);
    });

    test('a checkpoint saves the player and the ghosts, restarting goes back to it', () => {
        const checkpoint = place(new Checkpoint(new Vector(100, 0), track));
        const ghost = new GhostRunner(track, ',,,,,100,BMX,Ghost');
        ghost.createBike();
        track.ghostRunners.set(1, ghost);

        checkpoint.touch(playerAt(100, 0).hitbox);
        // The player and the ghost ride the same run
        track.playerRunner.time = ghost.time = 42;
        // Queued, then processed and saved at the start of the next tick of each runner
        track.playerRunner.fixedUpdate();
        expect(track.playerRunner.mustSave).toBe(false);
        expect(ghost.mustSave).toBe(true);
        ghost.fixedUpdate();

        expect(track.playerRunner.snapshots).toHaveLength(1);
        expect(ghost.snapshots).toHaveLength(1);

        track.playerRunner.time = ghost.time = 100;
        track.restart();
        expect(track.time).toBe(42);
        expect(ghost.time).toBe(42);
        expect(checkpoint.reached).toBe(true);
    });

    test('restarting from the start unreaches every item', () => {
        const target = place(new Target(new Vector(100, 0), track));
        target.touch(playerAt(100, 0).hitbox);

        track.restart();

        expect(target.reached).toBe(false);
        expect(track.playerRunner.targetsReached.size).toBe(0);
        expect(track.focalPoint).toBe(track.playerRunner.instance?.hitbox);
    });
});

describe('Item effects', () => {
    test('a boost pushes every point of the bike in its direction', () => {
        // Rotation 90: pointing left
        const boost = place(new Boost(new Vector(100, 0), 90, track));
        const bike = playerAt(100, 0);
        const before = bike.points.map((point) => point.pos.clone());

        boost.touch(bike.hitbox);

        bike.points.forEach((point, i) => {
            expect(point.pos.x).toBeCloseTo(before[i].x - 1);
            expect(point.pos.y).toBeCloseTo(before[i].y);
        });
    });

    test('a gravity item sets the gravity of the bike', () => {
        const gravity = place(new Gravity(new Vector(100, 0), 180, track));
        const bike = playerAt(100, 0);

        gravity.touch(bike.hitbox);

        expect(bike.gravity.x).toBeCloseTo(0);
        expect(bike.gravity.y).toBeCloseTo(-0.3);
    });

    test('a slow motion item slows the bike down', () => {
        const slowMo = place(new SlowMo(new Vector(100, 0), track));
        const bike = playerAt(100, 0);

        slowMo.touch(bike.hitbox);

        expect(bike.slow).toBe(true);
    });

    test('a bomb makes the bike explode', () => {
        const bomb = place(new Bomb(new Vector(100, 0), track));

        bomb.touch(playerAt(100, 0).hitbox);

        expect(track.playerRunner.dead).toBe(true);
        expect(track.playerRunner.instance).toBeNull();
        expect(track.playerRunner.deadObject?.points).toHaveLength(5);
    });

    test('an invincible bike does not explode nor crash', () => {
        const bike = playerAt(100, 0);
        place(new Invincibility(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new Bomb(new Vector(100, 0), track)).touch(bike.hitbox);
        track.playerRunner.crash();

        expect(track.playerRunner.dead).toBe(false);
        expect(track.playerRunner.modifiersMask).toBe(MODIFIERS.INVINCIBILITY);
    });

    test('status items change the bike, and the reset item restores it', () => {
        const bike = playerAt(100, 0);
        place(new Slippery(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new NoSteer(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new EngineOff(new Vector(100, 0), track)).touch(bike.hitbox);

        expect(bike.friction).toBe(1);
        expect(bike.backWheel.motor).toBe(0.05);
        expect(bike.speedValueScale).toBe(0.5);
        expect(bike.steerValueScale).toBe(0);
        expect(bike.engineValueScale).toBe(0);
        expect(track.playerRunner.modifiersMask).toBe(
            MODIFIERS.SLIPPERY | MODIFIERS.NO_STEER | MODIFIERS.ENGINE_OFF,
        );

        place(new Reset(new Vector(100, 0), track)).touch(bike.hitbox);

        expect(bike.friction).toBe(0.99);
        expect(bike.backWheel.motor).toBe(0.3);
        expect(bike.speedValueScale).toBe(1);
        expect(bike.steerValueScale).toBe(1);
        expect(bike.engineValueScale).toBe(1);
        expect(track.playerRunner.modifiersMask).toBe(0);
    });

    test('a zero gravity item makes the bike float until a reset item', () => {
        // Starting high above the ground line
        track = parseTrack('-50 1i 2000 1i#####BMX#0 -3k');
        const bike = track.playerRunner.instance;
        if (!bike) throw new Error('No player bike');
        const startY = bike.hitbox.pos.y;
        place(new ZeroGravity(bike.hitbox.pos.clone(), track)).touch(bike.hitbox);

        runTicks(track, 50);

        expect(bike.gravityValueScale).toBe(0);
        // The gravity direction is kept for the reset item
        expect(bike.gravity.y).toBe(0.3);
        expect(track.playerRunner.modifiersMask).toBe(MODIFIERS.ZERO_GRAVITY);
        expect(Math.abs(bike.hitbox.pos.y - startY)).toBeLessThan(1);

        place(new Reset(bike.hitbox.pos.clone(), track)).touch(bike.hitbox);
        runTicks(track, 50);

        expect(bike.gravityValueScale).toBe(1);
        expect(bike.hitbox.pos.y - startY).toBeGreaterThan(50);
    });

    test('the shards of a bike exploding without gravity float too', () => {
        const bike = playerAt(100, 0);
        place(new ZeroGravity(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new Bomb(new Vector(100, 0), track)).touch(bike.hitbox);

        const explosion = track.playerRunner.deadObject as { gravity: Vector };
        expect(explosion.gravity).toEqual(new Vector(0, 0));
    });

    test('the status effects survive restarting from a checkpoint', () => {
        const bike = playerAt(100, 0);
        place(new EngineOff(new Vector(100, 0), track)).touch(bike.hitbox);
        track.playerRunner.mustSave = true;
        track.playerRunner.fixedUpdate();

        track.restart();

        expect(track.playerRunner.instance?.engineValueScale).toBe(0);
        expect(track.playerRunner.modifiersMask).toBe(MODIFIERS.ENGINE_OFF);
    });
});

describe('Gravity, engine and steering effects', () => {
    test('heavy and low gravity scale the gravity, replacing the other gravity effects', () => {
        const bike = playerAt(100, 0);
        const runner = track.playerRunner;

        place(new ZeroGravity(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new Heavy(new Vector(100, 0), track)).touch(bike.hitbox);
        expect(bike.gravityValueScale).toBe(HEAVY_GRAVITY_SCALE);
        expect(runner.modifiersMask).toBe(MODIFIERS.HEAVY);

        place(new LowGravity(new Vector(100, 0), track)).touch(bike.hitbox);
        expect(bike.gravityValueScale).toBe(LOW_GRAVITY_SCALE);
        expect(runner.modifiersMask).toBe(MODIFIERS.LOW_GRAVITY);

        // The last gravity effect wins, the zero gravity too
        place(new ZeroGravity(new Vector(100, 0), track)).touch(bike.hitbox);
        expect(runner.modifiersMask).toBe(MODIFIERS.ZERO_GRAVITY);
    });

    test('a heavy bike falls faster, a low gravity one slower', () => {
        // Starting high above the ground line
        const fall = (itemClass: typeof Heavy | typeof LowGravity | null) => {
            track = parseTrack('-50 1i 2000 1i#####BMX#0 -3k');
            const bike = track.playerRunner.instance;
            if (!bike) throw new Error('No player bike');
            const startY = bike.hitbox.pos.y;
            if (itemClass) place(new itemClass(bike.hitbox.pos.clone(), track)).touch(bike.hitbox);
            runTicks(track, 20);
            return bike.hitbox.pos.y - startY;
        };

        const normal = fall(null);
        expect(fall(Heavy)).toBeGreaterThan(normal * 1.4);
        expect(fall(LowGravity)).toBeLessThan(normal * 0.5);
    });

    test('mirror swaps the lean controls, replacing no steer, and turbo powers the engine', () => {
        const bike = playerAt(100, 0);
        const runner = track.playerRunner;

        place(new NoSteer(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new Mirror(new Vector(100, 0), track)).touch(bike.hitbox);
        expect(bike.steerValueScale).toBe(-1);
        expect(runner.modifiersMask).toBe(MODIFIERS.MIRROR);

        place(new EngineOff(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new Turbo(new Vector(100, 0), track)).touch(bike.hitbox);
        expect(bike.engineValueScale).toBe(TURBO_ENGINE_SCALE);
        expect(runner.modifiersMask).toBe(MODIFIERS.MIRROR | MODIFIERS.TURBO);

        // Engine off replaces the turbo in turn
        place(new EngineOff(new Vector(100, 0), track)).touch(bike.hitbox);
        expect(runner.modifiersMask).toBe(MODIFIERS.MIRROR | MODIFIERS.ENGINE_OFF);
    });

    test('a mirrored rider leans the other way', () => {
        const lean = (mirrored: boolean) => {
            track = parseTrack('-50 1i 2000 1i#####BMX#0 0');
            const bike = track.playerRunner.instance;
            if (!bike) throw new Error('No player bike');
            if (mirrored) place(new Mirror(bike.hitbox.pos.clone(), track)).touch(bike.hitbox);
            track.playerRunner.controls.leftPressed = true;
            bike.updatePhysics();
            return bike.headToBack.len;
        };

        const rest = parseTrack('-50 1i 2000 1i#####BMX#0 0').playerRunner.instance?.headToBack.len;
        expect(Math.sign(lean(true) - (rest ?? 0))).toBe(-Math.sign(lean(false) - (rest ?? 0)));
    });

    test('the reset item removes them, and they survive restarting from a checkpoint', () => {
        const bike = playerAt(100, 0);
        place(new Heavy(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new Mirror(new Vector(100, 0), track)).touch(bike.hitbox);
        place(new Turbo(new Vector(100, 0), track)).touch(bike.hitbox);
        track.playerRunner.mustSave = true;
        track.playerRunner.fixedUpdate();

        track.restart();
        const restarted = track.playerRunner.instance;
        if (!restarted) throw new Error('No player bike');
        expect(restarted.gravityValueScale).toBe(HEAVY_GRAVITY_SCALE);
        expect(restarted.steerValueScale).toBe(-1);
        expect(restarted.engineValueScale).toBe(TURBO_ENGINE_SCALE);

        place(new Reset(restarted.hitbox.pos.clone(), track)).touch(restarted.hitbox);
        expect(restarted.gravityValueScale).toBe(1);
        expect(restarted.steerValueScale).toBe(1);
        expect(restarted.engineValueScale).toBe(1);
        expect(track.playerRunner.modifiersMask).toBe(0);
    });
});

describe('Launchers and mud', () => {
    test('a launcher kicks the bike once in its direction, again on the next pass', () => {
        // Rotation 180: pointing up
        const launcher = place(new Launcher(new Vector(100, 0), 180, track));
        const bike = playerAt(100, 0);
        const heights = () => bike.points.map((point) => point.pos.y);

        const before = heights();
        launcher.touch(bike.hitbox);
        heights().forEach((y, i) => expect(y).toBeCloseTo(before[i] - LAUNCH_STRENGTH));

        // Still the same pass on the next tick, or touched by another part
        const kicked = heights();
        track.playerRunner.time++;
        launcher.touch(bike.hitbox);
        launcher.touch(bike.backWheel);
        expect(heights()).toEqual(kicked);

        // A new pass after leaving it
        track.playerRunner.time += 10;
        launcher.touch(bike.hitbox);
        heights().forEach((y, i) => expect(y).toBeCloseTo(kicked[i] - LAUNCH_STRENGTH));
    });

    test('a launcher kicks again after restarting', () => {
        const launcher = place(new Launcher(new Vector(100, 0), 180, track));
        launcher.touch(playerAt(100, 0).hitbox);

        track.restart();
        const bike = playerAt(100, 0);
        const before = bike.hitbox.pos.y;
        launcher.touch(bike.hitbox);

        expect(bike.hitbox.pos.y).toBeCloseTo(before - LAUNCH_STRENGTH);
    });

    test('mud slows down the parts going through it', () => {
        const mud = place(new Mud(new Vector(100, 0), track));
        const bike = playerAt(100, 0);
        const wheel = bike.backWheel;
        wheel.pos.set(new Vector(100, 0));
        wheel.velocity.set(new Vector(10, 0));
        const before = wheel.pos.x;

        mud.touch(wheel);

        expect(wheel.pos.x).toBeCloseTo(before - 10 * (1 - MUD_GRIP));
    });

    test('are read from and written to track codes', () => {
        expect(ITEM_MAP.get('X')).toBe(Launcher);
        expect(ITEM_MAP.get('D')).toBe(Mud);
        expect(['K', 'F', 'M', 'U'].map((code) => ITEM_MAP.get(code))).toEqual([
            Heavy,
            LowGravity,
            Mirror,
            Turbo,
        ]);
        // Written with its rotation as the boosts, and read back the same
        const code = place(new Launcher(new Vector(32, 64), 90, track)).toString();
        const parsed = Launcher.createInstance(code.split(' '), track) as Launcher;
        expect(code.startsWith('X 10 20 ')).toBe(true);
        expect(parsed.rotation).toBe(90);
        expect(parsed.direction.x).toBeCloseTo(-LAUNCH_STRENGTH);
        expect(place(new Mud(new Vector(32, 64), track)).toString()).toBe('D 10 20');
    });
});

describe('Teleporters', () => {
    function placeTeleporters(): Teleporter[] {
        const group = LinkedItemGroup.createGroup(['W', '3c', '0', '6g', '0'], track, Teleporter);
        place(group);
        return group.instances as Teleporter[];
    }

    test('teleport the bike to the other teleporter of the group', () => {
        const [entry, exit] = placeTeleporters();
        const bike = playerAt(entry.pos.x, entry.pos.y);
        const before = bike.points.map((point) => point.pos.clone());

        entry.touch(bike.hitbox);

        const distance = exit.pos.sub(entry.pos);
        bike.points.forEach((point, i) => {
            expect(point.pos).toEqual(before[i].add(distance));
        });
        expect(entry.reached && exit.reached).toBe(true);
    });

    test('teleport a ghost once, without sending it back from the other teleporter', () => {
        const [entry, exit] = placeTeleporters();
        const ghost = new GhostRunner(track, ',,,,,100,BMX,Ghost');
        ghost.createBike();
        const bike = ghost.instance;
        if (!bike) throw new Error('No ghost bike');
        bike.hitbox.pos.set(entry.pos.clone());
        const before = bike.points.map((point) => point.pos.clone());

        // Landing on the exit, touched again on the same tick
        entry.touch(bike.hitbox);
        exit.touch(bike.hitbox);

        const distance = exit.pos.sub(entry.pos);
        bike.points.forEach((point, i) => {
            expect(point.pos).toEqual(before[i].add(distance));
        });

        // Then on the next tick
        ghost.fixedUpdate();
        const afterTick = bike.points.map((point) => point.pos.clone());
        exit.touch(bike.hitbox);
        bike.points.forEach((point, i) => {
            expect(point.pos).toEqual(afterTick[i]);
        });
        // Ghosts never mark the items, their runner records them instead
        expect(entry.reached || exit.reached).toBe(false);
        const reached = ghost.reachablesReached;
        expect(reached.has(entry.id) && reached.has(exit.id)).toBe(true);
    });

    test('are added, removed and exported as a whole', () => {
        const [entry, exit] = placeTeleporters();

        expect(entry.toString()).toBe('W 3c 0 6g 0');
        expect(exit.recorded).toBe(true);

        entry.removeFromTrack();
        expect(entry.onTrack || exit.onTrack).toBe(false);
        expect(track.reachables.size).toBe(0);

        exit.addToTrack();
        expect(entry.onTrack && exit.onTrack).toBe(true);
        // Adding a group twice does not duplicate its items
        entry.addToTrack();
        expect(track.layers.main[0].grid.totalObjects.size).toBe(2);
        const cellObjects = [...track.layers.main[0].grid.cells.values()].flatMap(
            (cell) => cell.objects,
        );
        expect(cellObjects.filter((item) => item instanceof LinkedItem)).toHaveLength(2);
    });
});

describe('Linked checkpoints', () => {
    function placeCheckpoints(): LinkedCheckpoint[] {
        const group = LinkedItemGroup.createGroup(
            ['L', '3c', '0', '6g', '0'],
            track,
            LinkedCheckpoint,
        );
        place(group);
        return group.instances as LinkedCheckpoint[];
    }

    test('reaching one reaches both, with a single checkpoint', () => {
        const [first, second] = placeCheckpoints();

        first.touch(playerAt(first.pos.x, first.pos.y).hitbox);
        expect(first.reached && second.reached).toBe(true);
        track.playerRunner.fixedUpdate();

        expect(track.playerRunner.snapshots).toHaveLength(1);
        const reached = track.playerRunner.reachablesReached;
        expect(reached.has(first.id) && reached.has(second.id)).toBe(true);
    });

    test('the other one cannot be taken afterwards, even after restarting', () => {
        const [first, second] = placeCheckpoints();
        first.touch(playerAt(first.pos.x, first.pos.y).hitbox);
        track.playerRunner.fixedUpdate();

        second.touch(playerAt(second.pos.x, second.pos.y).hitbox);
        track.playerRunner.fixedUpdate();
        expect(track.playerRunner.snapshots).toHaveLength(1);

        track.restart();
        expect(first.reached && second.reached).toBe(true);
        second.touch(playerAt(second.pos.x, second.pos.y).hitbox);
        track.playerRunner.fixedUpdate();
        expect(track.playerRunner.snapshots).toHaveLength(1);
    });

    test('are exported and parsed as a group', () => {
        const [first] = placeCheckpoints();

        expect(first.toString()).toBe('L 3c 0 6g 0');
        expect(ITEM_MAP.get('L')).toBe(LinkedCheckpoint);
    });
});

describe('Track objects', () => {
    test('serialize themselves in the track code format', () => {
        expect(new Target(new Vector(32, -64), track).toString()).toBe('T 10 -20');
        // The rotation is stored with a 180 degrees offset: 90 - 180 = -90 = -2q in base 32
        expect(new Boost(new Vector(0, 0), 90, track).toString()).toBe('B 0 0 -2q');
        expect(new Gravity(new Vector(0, 0), 180, track).toString()).toBe('G 0 0 0');
        expect(new ZeroGravity(new Vector(32, 0), track).toString()).toBe('Z 10 0');
        expect(ITEM_MAP.get('Z')).toBe(ZeroGravity);
    });

    test('are erased within the eraser radius only', () => {
        const target = place(new Target(new Vector(100, 0), track));

        expect(target.checkDelete(new Vector(130, 0), 10)).toBeNull();
        expect(target.checkDelete(new Vector(110, 0), 10)).toBe(target);
        expect(target.onTrack).toBe(false);
        // Already erased
        expect(target.checkDelete(new Vector(100, 0), 10)).toBeNull();
    });

    test('lines are erased by the point closest to the eraser', () => {
        const line = new SolidLine(new Vector(0, 100), new Vector(200, 100), track);
        place(line as never);

        expect(line.checkDelete(new Vector(100, 115), 10)).toBeNull();
        expect(line.checkDelete(new Vector(-5, 105), 10)).toBe(line);
    });

    test('adding and removing an object twice has no effect', () => {
        const target = place(new Target(new Vector(100, 0), track));
        target.addToTrack();
        expect(track.targets.size).toBe(1);

        target.removeFromTrack();
        target.removeFromTrack();
        expect(track.targets.size).toBe(0);
        expect(track.layers.main[0].grid.totalObjects.size).toBe(0);
    });

    test('require a layer to be added to the track', () => {
        expect(() => new Target(new Vector(), track).addToTrack()).toThrow(
            'is not placed on a layer',
        );
    });
});

describe('Solid lines', () => {
    test('push the parts colliding with them out and make them drive along', () => {
        const line = new SolidLine(new Vector(-100, 0), new Vector(100, 0), track);
        const bike = playerAt(0, -5);
        const drive = vi.spyOn(bike.hitbox, 'drive');

        line.touch(bike.hitbox);

        // The hitbox is moved to touch the line from above
        expect(bike.hitbox.pos.y).toBeCloseTo(-bike.hitbox.size);
        expect(drive).toHaveBeenCalledOnce();
        expect(drive.mock.calls[0][0].x).toBeCloseTo(1);
        // A line is touched once until the cell is untouched
        line.touch(bike.hitbox);
        expect(drive).toHaveBeenCalledOnce();
    });

    test('ignore the parts out of reach, and scenery lines never collide', () => {
        const solid = new SolidLine(new Vector(-100, 0), new Vector(100, 0), track);
        const scenery = new SceneryLine(new Vector(-100, 0), new Vector(100, 0), track);
        const bike = playerAt(0, -50);

        solid.touch(bike.hitbox);
        playerAt(0, -5);
        scenery.touch(bike.hitbox);

        expect(bike.hitbox.pos.y).toBe(-5);
    });
});
