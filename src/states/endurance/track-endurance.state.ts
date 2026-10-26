import { Layer } from 'canvade';
import { EnduranceCourse } from '../../openrider/endurance/endurance-course';
import { EnduranceRecords } from '../../openrider/endurance/endurance-records';
import { EnduranceRun } from '../../openrider/endurance/endurance-run';
import { EnduranceService } from '../../openrider/request/endurance-service';
import { GhostService } from '../../openrider/request/ghost-service';
import { LEFT_TOOLBAR_ENDURANCE } from '../../openrider/tool/toolbar.constants';
import { TrackInterfaceLayer } from '../track/layers/track-interface.layer';
import { TrackMainLayer } from '../track/layers/track-main.layer';
import { ToolbarDefinition } from '../track/track-view.definitions';
import { TrackPlayState } from '../track/track-play.state';
import { EnduranceHudLayer } from './layers/endurance-hud.layer';

/**
 * Endurance mode: riding an infinite track generated as the bike goes, harder and harder, as far
 * and as fast as possible. A run ends when the rider crashes or falls into a gap, the track having
 * no checkpoints: restarting tries the same track again, the new track tool another one.
 *
 * Entered from the endurance setup state, which creates the track and its course.
 */
export class TrackEnduranceState extends TrackPlayState {
    /** Run of the player, created when entering the state. */
    public run: EnduranceRun | null = null;
    private readonly records = new EnduranceRecords();

    public getToolbars(): ToolbarDefinition[] {
        return [{ side: 'left', tools: LEFT_TOOLBAR_ENDURANCE }];
    }

    protected override initState(): void {
        super.initState();

        this.subscribe('enter', this.startRun);
        // After the physics of the tick, run by the play state
        this.subscribe('fixedUpdate', this.followRun);
    }

    protected override initLayers(): Map<string, Layer> {
        return new Map<string, Layer>([
            ['main', new TrackMainLayer(this)],
            ['hud', new EnduranceHudLayer(this)],
            ['interface', new TrackInterfaceLayer(this)],
        ]);
    }

    private startRun(): void {
        const course = EnduranceCourse.of(this.track);
        if (!course) {
            throw new Error('The endurance track has no course');
        }
        this.run = new EnduranceRun(course, this.records);
        // E.g. the ghost of a link shared to race someone, followed by the camera as when racing
        // a track, until the player rides
        GhostService.raceInitialGhosts(this.track);
    }

    /** Follows the run, uploading it to the leaderboard of its track once over if asked to. */
    private followRun(): void {
        const run = this.run;
        if (run?.update() && EnduranceService.shouldSave(run.result)) {
            void EnduranceService.saveRun(run);
        }
    }
}
