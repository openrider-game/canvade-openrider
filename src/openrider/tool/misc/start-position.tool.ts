import { Control, KEYP, Vector } from 'canvade';
import { GhostRunner } from '../../bike/runner/ghost-runner';
import { Tool, ToolOption } from '../tool';

/** Moves the start position of the track, previewed with a dummy bike. */
export class StartPositionTool extends Tool {
    public static override readonly toolName: string = 'Start Position';
    public static override readonly keyLabel: string = 'P';
    public static override readonly key = new Control(KEYP);
    public static override readonly icon = 'start';

    public override alwaysRender = true;

    /** Runner of the preview bike, a ghost without inputs. */
    private dummyRunner: GhostRunner | null = null;

    public override activate(): void {
        super.activate();
        this.track.cursor = 'pointer';

        this.createDummyRunner();
    }

    public override onMouseMove(e: MouseEvent): void {
        super.onMouseMove(e);

        if (this.mouseDown) {
            this.dummyRunner?.instance?.setBikeInitialState(this.track.mousePos);
        }
    }

    public override onMouseUp(): void {
        if (!this.mouseDown) {
            return;
        }

        this.mouseDown = false;

        this.setStartPosition(this.track.mousePos);
    }

    private setStartPosition(pos: Vector): void {
        this.track.origin.set(pos);

        const playerRunner = this.track.playerRunner;
        playerRunner.initialBike = new playerRunner.bikeClass(this.track, playerRunner);

        this.dummyRunner?.instance?.setBikeInitialState(pos);
    }

    /** Recreates the preview bike, to be called when the player bike changes. */
    public createDummyRunner(): void {
        const bikeName = this.track.playerRunner.bikeClass.bikeName;
        this.dummyRunner = new GhostRunner(this.track, `,,,,,,${bikeName},Start Position`, false);

        this.dummyRunner.createBike();
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        this.dummyRunner?.renderInstance(ctx);
    }

    public override getOptions(): ToolOption[] {
        return [
            {
                label: 'Reset start position (0,0)',
                action: () => this.setStartPosition(new Vector()),
            },
        ];
    }
}
