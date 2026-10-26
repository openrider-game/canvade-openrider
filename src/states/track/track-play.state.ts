import { GameUpdateEvent, Layer } from 'canvade';
import { GhostService } from '../../openrider/request/ghost-service';
import { CAMERA_FOLLOW_FACTOR } from '../../openrider/track/track.constants';
import { Zoom } from '../../openrider/track/zoom';
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
    /** Set when a debug step ran while paused, so that the bikes are displayed at that tick. */
    private stepped = false;

    public override allowsDebug(): boolean {
        return true;
    }

    public override showsTouchControls(): boolean {
        return true;
    }

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

    /** Runs a physics tick, unless the track is paused and no debug step is pending. */
    private simulate(): void {
        const track = this.track;
        if (track.paused) {
            if (!track.pendingSteps) {
                return;
            }
            track.pendingSteps--;
            this.stepped = true;
        }

        // The player runs before the ghosts so that when it saves a checkpoint, the ghosts
        // physics have not been updated yet: otherwise they would run twice on the same tick
        // Each runner counts the tick in the time of its run
        track.playerRunner.fixedUpdate();
        track.ghostRunners.forEach((runner) => {
            if (!runner.done) {
                runner.fixedUpdate();
            }
        });
    }

    private interpolate(e: CustomEvent<GameUpdateEvent>): void {
        const { progress, delta } = e.detail;
        const track = this.track;

        // The player finished the race: offer once to save the run as a ghost
        if (track.playerRunner.done) {
            track.playerRunner.done = false;
            void GhostService.saveGhost(track);
        }

        if (!track.paused || this.stepped) {
            // A debug step is displayed as it is, without interpolating towards the next tick
            const displayProgress = track.paused ? 0 : progress;
            this.stepped = false;
            track.ghostRunners.forEach((runner) => {
                if (!runner.done) {
                    runner.update(displayProgress, delta);
                }
            });
            track.playerRunner.update(displayProgress, delta);
        }

        // A command block may show another point of the track for a while
        const hold = track.cameraHold;
        const focus = hold && track.time < hold.until ? hold.pos : track.focalPoint?.displayPos;
        if (focus) {
            track.camera.selfAdd(focus.sub(track.camera).scale(delta * CAMERA_FOLLOW_FACTOR));
        }
        this.easeZoom(delta);
    }

    /** Eases the zoom to the one a command block asked for, at the speed of the camera. */
    private easeZoom(delta: number): void {
        const track = this.track;
        if (track.zoomTarget === null) {
            return;
        }

        const target = Zoom.toPixel(track.zoomTarget, track.pixelRatio);
        const gap = target - track.zoomFactor;
        if (Math.abs(gap) < target * 0.001) {
            track.zoomFactor = target;
            track.zoomTarget = null;
        } else {
            track.zoomFactor += gap * Math.min(1, delta * CAMERA_FOLLOW_FACTOR);
        }
    }
}
