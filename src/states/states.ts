import { EnduranceSetupState } from './endurance/endurance-setup.state';
import { TrackEnduranceState } from './endurance/track-endurance.state';
import { TrackEditingState } from './track/track-editing.state';
import { TrackRacingState } from './track/track-racing.state';
import { TrackFetcherState } from './track-fetcher/track-fetcher.state';
import { TrackGeneratorState } from './track-generator/track-generator.state';
import { TrackParserState } from './track-parser/track-parser.state';
import { TrackUploadState } from './track-upload/track-upload.state';
import {
    STATE_ENDURANCE_SETUP,
    STATE_TRACK_EDITING,
    STATE_TRACK_ENDURANCE,
    STATE_TRACK_FETCHER,
    STATE_TRACK_GENERATOR,
    STATE_TRACK_PARSER,
    STATE_TRACK_RACING,
    STATE_TRACK_UPLOAD,
} from './state-names';

/**
 * States of the game with their names, registered by `main.ts`.
 *
 * Flow: the track fetcher downloads the track code (or takes the default one) and pushes the
 * parser, which builds the track and pushes the editing or racing state. The editing state pushes
 * the generator to export or upload the track, the generator replacing itself with the upload
 * state when uploading. Popping back to the parser parses the session track code again, which is
 * how a track is imported.
 *
 * In endurance mode (see GameConfig), the endurance setup state creates the track in place of the
 * fetcher and the parser, and pushes the endurance state.
 */
export default {
    TrackFetcher: {
        name: STATE_TRACK_FETCHER,
        state: TrackFetcherState,
    },
    TrackParser: {
        name: STATE_TRACK_PARSER,
        state: TrackParserState,
    },
    TrackEditing: {
        name: STATE_TRACK_EDITING,
        state: TrackEditingState,
    },
    TrackRacing: {
        name: STATE_TRACK_RACING,
        state: TrackRacingState,
    },
    TrackGenerator: {
        name: STATE_TRACK_GENERATOR,
        state: TrackGeneratorState,
    },
    TrackUpload: {
        name: STATE_TRACK_UPLOAD,
        state: TrackUploadState,
    },
    EnduranceSetup: {
        name: STATE_ENDURANCE_SETUP,
        state: EnduranceSetupState,
    },
    TrackEndurance: {
        name: STATE_TRACK_ENDURANCE,
        state: TrackEnduranceState,
    },
};
