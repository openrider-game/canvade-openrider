import { Control, KEYN } from 'canvade';
import { EnduranceCourse } from '../../endurance/endurance-course';
import { SeededRandom } from '../../endurance/seeded-random';
import { Tool } from '../tool';

/** Generates a new endurance track, from a new seed, and restarts from its start. */
export class NewTrackTool extends Tool {
    public static override readonly toolName: string = 'New Track';
    public static override readonly key = new Control(KEYN);
    public static override readonly icon = 'dice';

    public override run(): void {
        const course = EnduranceCourse.of(this.track);
        if (!course) {
            return;
        }

        course.reset(SeededRandom.randomSeed());
        this.track.playerRunner.reset();
        this.track.restart();
    }
}
