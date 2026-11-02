import { UIStyleDefinition } from 'canvade';
import { FRAME_DURATION } from '../../../openrider/constants/game.constants';
import type { EnduranceResult } from '../../../openrider/endurance/endurance-records';
import type { RunUpload } from '../../../openrider/endurance/endurance-run';
import { modifierNames } from '../../../openrider/item/modifiers';
import { TouchControls } from '../../../openrider/touch/touch-controls';
import { Time } from '../../../openrider/numeric/time';
import { RestartTool } from '../../../openrider/tool/misc/restart.tool';
import { hudMargin, LINE_HEIGHT, TrackHudLayer } from '../../track/layers/track-hud.layer';
import {
    themeStyles,
    UI_BORDER_COLOR,
    UI_DISABLED_TEXT_COLOR,
    uiMetrics,
} from '../../track/ui/ui-theme';
import type { TrackEnduranceState } from '../track-endurance.state';
import { LATEST_GENERATOR_VERSION } from '../../../openrider/endurance/terrain/versions';

/** Sizes of the panel shown once a run is over, in UI pixels. */
const PANEL_WIDTH = 300,
    PADDING = 12,
    GAP = 6,
    TITLE_SIZE = 18,
    /** Height of the line telling how the upload went, two lines for the reasons of a refusal. */
    UPLOAD_HEIGHT = 34;

/** What the panel of a run over shows, its interface being built again when it changes. */
interface ResultPanel {
    title: string;
    result: string;
    upload: string;
    /** Whether the button tells its key, without a keyboard on touch screens. */
    touch: boolean;
}

/**
 * Heads-up display of the endurance mode: time, distance, difficulty and status effects of the
 * run at the top left, then the state of the live session if any; the track and the records at
 * the top right, then the distance of each rider of the session; and the result of the run in
 * a panel of the canvade UI at the middle once the rider fell, with a button trying again.
 */
export class EnduranceHudLayer extends TrackHudLayer {
    /** Content of the panel of the result as last built, null without it. */
    private builtPanel: string | null = null;

    public constructor(private readonly endurance: TrackEnduranceState) {
        super(endurance);
        this.subscribe('update', () => this.refreshResult());
    }

    protected override drawHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const run = this.endurance.run;
        if (!run) {
            return;
        }
        const course = run.course;
        const bike = course.track.playerRunner.instance;
        const difficulty = course.difficultyAt(bike?.hitbox.pos.x ?? course.track.origin.x);

        ctx.lineWidth = 0.5;
        ctx.fillStyle = '#000';
        const left = [
            EnduranceHudLayer.time(run.time),
            `${Math.floor(run.distance)} m`,
            `Difficulty ${Math.round(difficulty * 100)}%`,
        ];
        // The status effects of the zone the bike rides through
        const effects = modifierNames(course.track.playerRunner.modifiersMask);
        if (effects.length > 0) {
            left.push(effects.join(', '));
        }
        left.forEach((text, index) => ctx.fillText(text, hudMargin(), LINE_HEIGHT * (index + 1)));

        const trackBest = run.records.bestOn(course.seed, course.version);
        const right = [
            // The tracks of the older versions of the generator tell theirs
            course.version === LATEST_GENERATOR_VERSION
                ? `Track ${course.seed}`
                : `Track ${course.seed} (v${course.version})`,
            `Track best: ${EnduranceHudLayer.result(trackBest)}`,
            `Best: ${EnduranceHudLayer.result(run.records.best)}`,
        ];
        right.forEach((text, index) =>
            ctx.fillText(
                text,
                width - hudMargin() - ctx.measureText(text).width,
                LINE_HEIGHT * (index + 1),
            ),
        );

        this.drawLiveRiders(ctx, width, right.length + 1, (runner) => {
            const rider = course.riderOf(runner);
            const distance = `${Math.floor(rider?.distance ?? 0)} m`;
            if (!rider?.over) {
                return distance;
            }
            return rider.retired ? `retired at ${distance}` : `fell at ${distance}`;
        });
        this.drawLiveState(ctx, left.length + 1);
    }

    /** What the panel of the result shows, null while the run goes on. */
    private resultPanel(): ResultPanel | null {
        const run = this.endurance.run;
        if (!run?.result) {
            return null;
        }
        const beaten = run.beaten;
        const ended = run.retired ? 'Retired' : 'Crashed';
        return {
            title: beaten?.overall ? 'New record!' : beaten?.track ? 'Track record!' : ended,
            result: EnduranceHudLayer.result(run.result),
            upload: EnduranceHudLayer.upload(run.upload),
            touch: TouchControls.enabled,
        };
    }

    /**
     * Shows the result of the run over in a panel at the middle, built again only when what it
     * shows changes, e.g. once the run is saved, and removed once the rider tries again.
     */
    private refreshResult(): void {
        const panel = this.resultPanel();
        const content = panel && JSON.stringify(panel);
        if (content === this.builtPanel) {
            return;
        }
        this.builtPanel = content;
        if (!panel) {
            this.uiRenderer.setUI([], {});
            return;
        }

        const { fontSize, actionHeight } = uiMetrics();
        const heights = [TITLE_SIZE + 4, fontSize + 4, UPLOAD_HEIGHT, actionHeight];
        const text = (size: number, height: number, color = UI_BORDER_COLOR) => ({
            color,
            fontSize: size,
            wrap: 'word' as const,
            textAlign: 'center' as const,
            width: '100%',
            height,
        });
        const styles: UIStyleDefinition = {
            ...themeStyles(),
            '.endurance-result': {
                horizontalAlign: 'center',
                verticalAlign: 'middle',
                width: PANEL_WIDTH,
                height: 2 * PADDING + heights.reduce((a, b) => a + b, 0) + 3 * GAP,
                padding: PADDING,
                gap: GAP,
            },
            '.endurance-title': { ...text(TITLE_SIZE, heights[0]), text: panel.title },
            '.endurance-score': { ...text(fontSize, heights[1]), text: panel.result },
            '.endurance-upload': {
                ...text(fontSize - 2, heights[2], UI_DISABLED_TEXT_COLOR),
                text: panel.upload,
            },
            // The key of the restart tool, with a keyboard
            '.endurance-retry': {
                text: panel.touch ? 'Try again' : 'Try again (Enter)',
                width: '100%',
                height: heights[3],
            },
        };
        this.uiRenderer.setUI(
            [
                {
                    'container.panel.endurance-result': [
                        'text.endurance-title',
                        'text.endurance-score',
                        'text.endurance-upload',
                        { 'button.endurance-retry': { events: { click: () => this.retry() } } },
                    ],
                },
            ],
            styles,
        );
    }

    /** Tries again, as the restart tool does: the run is saved first if it can be. */
    private retry(): void {
        const track = this.endurance.track;
        const restart = track.toolCollection.getByToolName(RestartTool.toolName);
        if (restart) {
            restart.run();
        } else {
            track.retireRun?.();
            track.restart();
        }
    }

    /** How the upload of the run to the leaderboard went, empty when not uploaded. */
    private static upload(upload: RunUpload): string {
        switch (upload.state) {
            case 'saving':
                return 'Saving to the leaderboard...';
            case 'saved':
                // Rank 0: kept for an admin, before it ranks
                return upload.rank > 0
                    ? `Saved to the leaderboard: rank ${upload.rank}`
                    : 'Saved, checked by an admin before it ranks';
            case 'refused':
                return `Not saved: ${upload.reason}`;
            default:
                return '';
        }
    }

    /** A time in physics ticks, as `mm:ss.d`. */
    private static time(ticks: number): string {
        return Time.format(ticks * FRAME_DURATION);
    }

    /** A result as `123 m in 01:02.3`, or a dash without one. */
    private static result(result: EnduranceResult | null): string {
        return result
            ? `${Math.floor(result.distance)} m in ${EnduranceHudLayer.time(result.time)}`
            : '-';
    }
}
