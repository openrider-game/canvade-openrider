import { State } from 'canvade';
import { Session } from './session';

/** Base of the OpenRider states, giving access to the data shared between states. */
export abstract class OpenRiderState extends State {
    /**
     * Data shared between the states, available once the state is attached to its manager (not
     * while the state is constructed).
     */
    public get session(): Session {
        return new Session(this.manager.shared);
    }
}
