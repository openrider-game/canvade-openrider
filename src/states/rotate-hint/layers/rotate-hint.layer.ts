import { Layer, UIImage } from 'canvade';
import { GameConfig } from '../../../openrider/config/game-config';
import { themeStyles, UI_BORDER_COLOR } from '../../track/ui/ui-theme';

const PANEL_WIDTH = 260,
    PADDING = 16,
    GAP = 12,
    ICON_SIZE = 64,
    TEXT_HEIGHT = 44,
    TEXT = 'Turn your device sideways to play.';

/**
 * Hint of the {@link RotateHintState}: a panel centered on the canvas, like the panels of the
 * track states, with an icon of a device turning and the hint.
 */
export class RotateHintLayer extends Layer {
    public initLayer(): void {}

    /** Builds the hint. */
    public build(): void {
        const src = GameConfig.url('media/icon/rotate.svg');
        // Drawn on the first frame
        UIImage.load(src);

        this.uiRenderer.setUI(
            [{ 'container.panel.rotate': ['image.rotate-icon', 'text.rotate-text'] }],
            {
                ...themeStyles(),
                '.rotate': {
                    horizontalAlign: 'center',
                    verticalAlign: 'middle',
                    width: PANEL_WIDTH,
                    height: 2 * PADDING + ICON_SIZE + GAP + TEXT_HEIGHT,
                    padding: PADDING,
                    gap: GAP,
                },
                '.rotate-icon': { src, fit: 'contain', width: '100%', height: ICON_SIZE },
                '.rotate-text': {
                    text: TEXT,
                    color: UI_BORDER_COLOR,
                    fontSize: 16,
                    wrap: 'word',
                    textAlign: 'center',
                    width: '100%',
                    height: TEXT_HEIGHT,
                },
            },
        );
    }
}
