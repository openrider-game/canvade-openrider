import { UIStructureDefinition, UIStyleDefinition } from 'canvade';
import { DEBUG_OPTION_LABELS, DebugOptions } from '../../../openrider/track/debug-options';
import type { Track } from '../../../openrider/track/track';
import {
    panelHeight,
    UI_ROW_HEIGHT,
    UI_SELECTED_BACKGROUND_COLOR,
    UI_SELECTED_TEXT_COLOR,
} from './ui-theme';

const OPTIONS = Object.keys(DEBUG_OPTION_LABELS) as Array<keyof DebugOptions>;

/** Position of the debug panel, right of the left toolbar, under the race time. */
export const DEBUG_PANEL_X = 34,
    DEBUG_PANEL_Y = 40,
    DEBUG_PANEL_WIDTH = 140,
    /** Bottom of the debug panel, under which the stats overlay is drawn, in UI pixels. */
    DEBUG_PANEL_BOTTOM = DEBUG_PANEL_Y + panelHeight(OPTIONS.length + 1);

/**
 * Debug panel of the track states, displayed while the debug mode is enabled: one toggle per
 * overlay (highlighted while shown), and a button running a single physics tick, pausing the
 * track first, to follow the physics frame by frame.
 */
export abstract class DebugPanel {
    /** Adds the panel to an interface being built: its elements and their styles. */
    public static build(
        track: Track,
        structure: UIStructureDefinition,
        styles: UIStyleDefinition,
    ): void {
        const options = track.debugOptions;

        structure.push({
            'container.overlay.panel.debug': [
                ...OPTIONS.map((option) => ({
                    [`button.debug-${option}`]: {
                        events: {
                            click: () => {
                                options[option] = !options[option];
                                track.invalidateUI();
                            },
                        },
                    },
                })),
                { 'button.debug-step': { events: { click: () => track.step() } } },
            ],
        });

        styles['.debug'] = {
            x: DEBUG_PANEL_X,
            y: DEBUG_PANEL_Y,
            width: DEBUG_PANEL_WIDTH,
            height: panelHeight(OPTIONS.length + 1),
        };
        styles['.debug button'] = { width: '100%', height: UI_ROW_HEIGHT };
        for (const option of OPTIONS) {
            styles[`.debug-${option}`] = {
                text: DEBUG_OPTION_LABELS[option],
                ...(options[option]
                    ? {
                          backgroundColor: UI_SELECTED_BACKGROUND_COLOR,
                          hoverBackgroundColor: UI_SELECTED_BACKGROUND_COLOR,
                          textColor: UI_SELECTED_TEXT_COLOR,
                      }
                    : {}),
            };
        }
        styles['.debug-step'] = { text: 'Step one tick' };
    }
}
