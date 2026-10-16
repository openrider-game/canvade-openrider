import { GameUpdateEvent, Layer } from 'canvade';
import { GhostService } from '../../openrider/request/ghost-service';
import { CAMERA_FOLLOW_FACTOR } from '../../openrider/track/track.constants';
import { TrackHudLayer } from './layers/track-hud.layer';
import { TrackInterfaceLayer } from './layers/track-interface.layer';
import { TrackMainLayer } from './layers/track-main.layer';
import { TrackViewState } from './track-view.state';

/**
 * Base of the states where the bikes ride the track: runs the physics of the player and the ghosts
 * on fixed updates, interpolates their display on updates and moves the camera towards the focal
 * point.
 */
export abstract class TrackPlayState extends TrackViewState {
    protected override initState(): void {
        super.initState();

        this.subscribe('fixedUpdate', this.simulate);
        this.subscribe('update', this.interpolate);
    }

    protected initLayers(): Map<string, Layer> {
        return new Map<string, Layer>([
            ['main', new TrackMainLayer(this)],
            ['hud', new TrackHudLayer(this)],
            ['interface', new TrackInterfaceLayer(this)],
        ]);
    }

    private simulate(): void {
        const track = this.track;
        if (track.paused) {
            return;
        }

        // The player runs before the ghosts so that when it saves a checkpoint, the ghosts
        // physics have not been updated yet: otherwise they would run twice on the same tick
        track.playerRunner.fixedUpdate();
        track.ghostRunners.forEach((runner) => {
            if (!runner.done) {
                runner.fixedUpdate();
            }
        });

        track.time++;
    }

    private interpolate(e: CustomEvent<GameUpdateEvent>): void {
        const { progress, delta } = e.detail;
        const track = this.track;

        // The player finished the race: offer once to save the run as a ghost
        if (track.playerRunner.done) {
            track.playerRunner.done = false;
            void GhostService.saveGhost(track);
        }

        if (!track.paused) {
            track.ghostRunners.forEach((runner) => {
                if (!runner.done) {
                    runner.update(progress, delta);
                }
            });
            track.playerRunner.update(progress, delta);
        }

        if (track.focalPoint) {
            track.camera.selfAdd(
                track.focalPoint.displayPos.sub(track.camera).scale(delta * CAMERA_FOLLOW_FACTOR),
            );
        }
    }
}
