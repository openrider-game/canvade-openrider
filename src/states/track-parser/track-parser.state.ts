import { Layer } from 'canvade';
import { TrackParser } from '../../openrider/parser/track-parser';
import { Track } from '../../openrider/track/track';
import { TRACK_DEFAULT, TRACK_MODE_RACING } from '../../openrider/track/track.constants';
import { OpenRiderState } from '../openrider.state';
import { STATE_TRACK_EDITING, STATE_TRACK_RACING } from '../state-names';
import { TrackParserLayer } from './layers/track-parser.layer';

/**
 * Builds a new track from the session track code, one step per update, then stores it in the
 * session and pushes the racing or editing state depending on the session track mode.
 *
 * Every enter starts a new parsing, so popping back to this state parses the session track code
 * again (e.g. when importing a track).
 */
export class TrackParserState extends OpenRiderState {
    /** Parser of the running parsing, `null` before entering the state and once done. */
    public parser: TrackParser | null = null;

    protected initState(): void {
        this.subscribe('enter', this.startParsing);
        this.subscribe('update', this.parseStep);
    }

    protected initLayers(): Map<string, Layer> {
        return new Map<string, Layer>([['main', new TrackParserLayer(this)]]);
    }

    private startParsing(): void {
        const session = this.session;
        const racing = session.trackMode === TRACK_MODE_RACING;

        this.parser = new TrackParser(new Track(racing ? session.trackId : null));
        this.parser.init(session.trackCode ?? TRACK_DEFAULT);
    }

    private parseStep(): void {
        const parser = this.parser;
        if (!parser) {
            return;
        }

        if (!parser.done) {
            parser.currentStep();
            parser.updateIndicators();
            return;
        }

        this.parser = null;

        const session = this.session;
        session.track = parser.track;
        this.manager.push(
            session.trackMode === TRACK_MODE_RACING ? STATE_TRACK_RACING : STATE_TRACK_EDITING,
        );
    }
}
