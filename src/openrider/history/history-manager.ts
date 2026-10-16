/** Track edit that can be undone and redone. */
export interface HistoryAction {
    undo(): void;
    redo(): void;
}

/**
 * Undo / redo stack of the track edits. Actions pushed while a group is open
 * (e.g. the segments of a brush stroke) are undone and redone together.
 */
export class HistoryManager {
    private readonly history: HistoryAction[] = [];
    private position = 0;
    private group: HistoryAction[] | null = null;

    /**
     * Records an action that has already been done, in the open group if there is one.
     *
     * @returns The manager itself, for chaining.
     */
    public push(action: HistoryAction): this {
        if (this.group) {
            this.group.push(action);
            return this;
        }

        // Pushing a new action drops the actions that were undone
        this.history.splice(Math.min(this.history.length, this.position + 1));
        this.position = this.history.push(action) - 1;
        return this;
    }

    /** Starts grouping the next actions, does nothing if a group is already open. */
    public startGroup(): void {
        this.group ??= [];
    }

    /** Pushes the actions of the open group as a single action. */
    public endGroup(): void {
        const actions = this.group;
        this.group = null;

        if (actions?.length) {
            this.push({
                undo: () => [...actions].reverse().forEach((action) => action.undo()),
                redo: () => actions.forEach((action) => action.redo()),
            });
        }
    }

    /** Closes the open group, then undoes the last action, if any. */
    public undo(): this {
        this.endGroup();
        if (this.position >= 0 && this.history.length) {
            this.history[this.position--].undo();
        }
        return this;
    }

    /** Closes the open group, then redoes the last undone action, if any. */
    public redo(): this {
        this.endGroup();
        if (this.position < this.history.length - 1) {
            this.history[++this.position].redo();
        }
        return this;
    }
}
