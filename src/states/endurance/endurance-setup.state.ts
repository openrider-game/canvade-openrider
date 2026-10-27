import { Layer } from 'canvade';
import { GameConfig } from '../../openrider/config/game-config';
import { EnduranceCourse } from '../../openrider/endurance/endurance-course';
import { SeededRandom } from '../../openrider/endurance/seeded-random';
import { Track } from '../../openrider/track/track';
import { OpenRiderState } from '../openrider.state';
import { STATE_TRACK_ENDURANCE } from '../state-names';

/**
 * First state of the endurance mode, in place of the track fetcher: creates the track, its
 * course from the seed and the version of the host element (a new track by default) and the bike
 * of the player,
 * then pushes the endurance state on the next update.
 *
 * The track exists before the endurance state is entered, as its layers use it on entering.
 */
export class EnduranceSetupState extends OpenRiderState {
    private done = false;

    protected initState(): void {
        this.subscribe('enter', this.createTrack);
        this.subscribe('update', this.checkCreated);
    }

    protected initLayers(): Map<string, Layer> {
        return new Map<string, Layer>();
    }

    private createTrack(): void {
        const track = new Track(null);
        // A new track is on the version of the page, the latest one by default: e.g. the one in
        // development, to try it
        if (GameConfig.seed === null) {
            new EnduranceCourse(track, SeededRandom.randomSeed(), GameConfig.version);
        } else {
            new EnduranceCourse(track, GameConfig.seed, GameConfig.version);
        }

        const runner = track.playerRunner;
        runner.createBike();
        track.focalPoint = runner.instance?.hitbox ?? null;

        this.session.track = track;
        this.done = true;
    }

    private checkCreated(): void {
        if (this.done) {
            this.done = false;
            this.manager.push(STATE_TRACK_ENDURANCE);
        }
    }
}
