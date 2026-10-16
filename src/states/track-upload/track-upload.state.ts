import { Layer } from 'canvade';
import { TRACKUPLOAD_URL } from '../../openrider/constants/request.constants';
import { Requests } from '../../openrider/request/requests';
import { UPLOAD_TOOLBAR } from '../../openrider/tool/toolbar.constants';
import { TrackRenderer } from '../../openrider/track/track-renderer';
import { TrackInterfaceLayer } from '../track/layers/track-interface.layer';
import { TrackMainLayer } from '../track/layers/track-main.layer';
import { ButtonDefinition, ToolbarDefinition } from '../track/track-view.definitions';
import { TrackViewState } from '../track/track-view.state';
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, TrackUploadLayer } from './layers/track-upload.layer';

/**
 * Lets the player frame the thumbnail of the track before uploading it, pushed by the generator
 * state with the generated code in the session.
 *
 * Only the camera and fullscreen tools are available. Uploading redirects to the page of the
 * published track, cancelling pops back to the editing state.
 */
export class TrackUploadState extends TrackViewState {
    protected initLayers(): Map<string, Layer> {
        return new Map<string, Layer>([
            ['main', new TrackMainLayer(this, false)],
            ['overlay', new TrackUploadLayer()],
            ['interface', new TrackInterfaceLayer(this)],
        ]);
    }

    public getToolbars(): ToolbarDefinition[] {
        return [{ side: 'left', tools: UPLOAD_TOOLBAR }];
    }

    public override getButtons(): ButtonDefinition[] {
        return [
            {
                label: 'Cancel',
                x: 10,
                y: 10,
                width: 100,
                height: 26,
                verticalAlign: 'bottom',
                action: () => this.manager.pop(),
            },
            {
                label: 'Upload with thumbnail',
                x: 0,
                y: 10,
                width: 200,
                height: 26,
                horizontalAlign: 'center',
                verticalAlign: 'bottom',
                action: () => void this.upload(),
            },
        ];
    }

    /**
     * Renders the framed part of the track as a PNG data URL.
     *
     * The frame is displayed at half the thumbnail size, so the view is rendered at twice the zoom
     * and the thumbnail is cropped from its center at full size.
     */
    private createThumbnail(): string {
        const track = this.track;
        const thumbnail = document.createElement('canvas');
        thumbnail.width = THUMBNAIL_WIDTH;
        thumbnail.height = THUMBNAIL_HEIGHT;

        // Rendered on a canvas of the size of the view, without the interface
        const view = document.createElement('canvas');
        view.width = track.viewWidth;
        view.height = track.viewHeight;
        const viewContext = view.getContext('2d');
        const thumbnailContext = thumbnail.getContext('2d');
        if (!viewContext || !thumbnailContext) {
            throw new Error('Cannot retrieve thumbnail context');
        }

        track.zoomFactor *= 2;
        viewContext.lineCap = 'round';
        viewContext.lineJoin = 'round';
        // Rendered synchronously: the thumbnail cannot wait for the workers
        TrackRenderer.render(viewContext, track, false, false);
        track.zoomFactor /= 2;

        thumbnailContext.drawImage(
            view,
            (view.width - THUMBNAIL_WIDTH) / 2,
            (view.height - THUMBNAIL_HEIGHT) / 2,
            THUMBNAIL_WIDTH,
            THUMBNAIL_HEIGHT,
            0,
            0,
            THUMBNAIL_WIDTH,
            THUMBNAIL_HEIGHT,
        );

        return thumbnail.toDataURL('image/png');
    }

    private async upload(): Promise<void> {
        const image = this.createThumbnail();

        try {
            const response = await Requests.postJson<{ ID: number }>(TRACKUPLOAD_URL, {
                trackCode: this.session.trackCode ?? '',
                thumbnail: image.replace('data:image/png;base64,', ''),
            });

            location.href = `./tracks/${response.ID}/`;
        } catch (e) {
            alert(`Your track was refused: ${e}`);
        }
    }
}
