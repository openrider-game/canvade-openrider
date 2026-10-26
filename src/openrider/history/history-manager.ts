import { invertEdit, TrackEdit } from '../edit/track-edit';

/**
 * Undo / redo stack of the track edits, kept as data (see {@link TrackEdit}). Edits pushed while
 * a group is open (e.g. the segments of a brush stroke) are undone and redone together.
 */
export class HistoryManager {
    private readonly history: TrackEdit[] = [];
    private position = -1;
    private group: TrackEdit[] | null = null;

    /**
     * @param apply - Applies an edit to the track, without history: the inverse of an edit to
     *   undo it, the edit itself to redo it.
     */
    public constructor(private readonly apply: (edit: TrackEdit) => void) {}

    /**
     * Records an edit that has already been made, in the open group if there is one.
     *
     * @returns The manager itself, for chaining.
     */
    public push(edit: TrackEdit): this {
        if (this.group) {
            this.group.push(edit);
            return this;
        }

        // Pushing a new edit drops the edits that were undone
        this.history.splice(this.position + 1);
        this.position = this.history.push(edit) - 1;
        return this;
    }

    /** Forgets every edit, e.g. the track being replaced. */
    public clear(): void {
        this.history.length = 0;
        this.position = -1;
        this.group = null;
    }

    /** Starts grouping the next edits, does nothing if a group is already open. */
    public startGroup(): void {
        this.group ??= [];
    }

    /** Pushes the edits of the open group as a single edit. */
    public endGroup(): void {
        const edits = this.group;
        this.group = null;

        if (edits?.length) {
            this.push({ type: 'group', edits });
        }
    }

    /** Closes the open group, then undoes the last edit, if any. */
    public undo(): this {
        this.endGroup();
        if (this.position >= 0) {
            this.apply(invertEdit(this.history[this.position--]));
        }
        return this;
    }

    /** Closes the open group, then redoes the last undone edit, if any. */
    public redo(): this {
        this.endGroup();
        if (this.position < this.history.length - 1) {
            this.apply(this.history[++this.position]);
        }
        return this;
    }
}
