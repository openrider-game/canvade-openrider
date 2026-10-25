import { Control, CTRL, KEYB } from 'canvade';
import { SWITCH_MAP } from '../../bike/bike.constants';
import { Tool } from '../tool';
import { StartPositionTool } from './start-position.tool';

/** Switches the player to the next bike and restarts the race from the start. */
export class SwitchBikeTool extends Tool {
    public static override readonly toolName: string = 'Switch Bike';
    public static override readonly key = new Control(KEYB, CTRL);
    public static override readonly icon = 'bike';

    public override run(): void {
        const playerRunner = this.track.playerRunner;
        playerRunner.bikeClass =
            SWITCH_MAP.get(playerRunner.bikeClass.bikeName) ?? playerRunner.bikeClass;
        playerRunner.createBike();

        // The checkpoints of the previous bike are no longer valid
        playerRunner.reset();
        this.track.ghostRunners.forEach((runner) => runner.reset());

        this.track.restart();

        const startPositionTool = this.track.toolCollection.getByToolName(
            StartPositionTool.toolName,
        );
        if (startPositionTool instanceof StartPositionTool) {
            startPositionTool.createDummyRunner();
        }
    }
}
