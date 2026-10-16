import { describe, expect, test } from 'vitest';
import { HistoryManager } from '../../src/openrider/history/history-manager';

/** History of a list of numbers, each action adding one number. */
function createHistory() {
    const values: number[] = [];
    const history = new HistoryManager();
    const add = (value: number) => {
        values.push(value);
        history.push({
            undo: () => values.splice(values.lastIndexOf(value), 1),
            redo: () => values.push(value),
        });
    };

    return { values, history, add };
}

describe('History manager', () => {
    test('undoes and redoes the actions in order', () => {
        const { values, history, add } = createHistory();
        add(1);
        add(2);
        add(3);

        history.undo().undo();
        expect(values).toEqual([1]);

        history.redo();
        expect(values).toEqual([1, 2]);
    });

    test('does nothing when there is nothing to undo or redo', () => {
        const { values, history, add } = createHistory();
        history.undo().redo();
        add(1);

        history.redo();
        expect(values).toEqual([1]);

        history.undo().undo();
        expect(values).toEqual([]);
    });

    test('drops the undone actions when a new action is pushed', () => {
        const { values, history, add } = createHistory();
        add(1);
        add(2);
        add(3);
        history.undo().undo();

        add(4);
        history.redo();
        expect(values).toEqual([1, 4]);

        history.undo().undo();
        expect(values).toEqual([]);
        history.redo().redo().redo();
        expect(values).toEqual([1, 4]);
    });

    test('undoes and redoes the actions of a group at once', () => {
        const { values, history, add } = createHistory();
        add(1);
        history.startGroup();
        add(2);
        add(3);
        // Starting a group while one is open keeps the same group
        history.startGroup();
        add(4);
        history.endGroup();

        history.undo();
        expect(values).toEqual([1]);

        history.redo();
        expect(values).toEqual([1, 2, 3, 4]);
    });

    test('closes the open group before undoing', () => {
        const { values, history, add } = createHistory();
        history.startGroup();
        add(1);
        add(2);

        history.undo();
        expect(values).toEqual([]);
    });

    test('ignores empty groups', () => {
        const { values, history, add } = createHistory();
        add(1);
        history.startGroup();
        history.endGroup();

        history.undo();
        expect(values).toEqual([]);
    });
});
