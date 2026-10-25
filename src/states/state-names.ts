/**
 * Names of the states in the state manager, kept apart from the state classes to avoid circular
 * imports.
 */
export const STATE_TRACK_FETCHER = 'trackFetcher',
    STATE_TRACK_PARSER = 'trackParser',
    STATE_TRACK_EDITING = 'trackEditing',
    STATE_TRACK_RACING = 'trackRacing',
    STATE_TRACK_GENERATOR = 'trackGenerator',
    STATE_TRACK_UPLOAD = 'trackUpload',
    STATE_ENDURANCE_SETUP = 'enduranceSetup',
    STATE_TRACK_ENDURANCE = 'trackEndurance';
