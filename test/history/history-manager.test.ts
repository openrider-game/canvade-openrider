import { describe, expect, test } from 'vitest';
import type { TrackEdit } from '../../src/openrider/edit/track-edit';
import { HistoryManager } from '../../src/openrider/history/history-manager';

/** History of a list of numbers, each edit adding the object of a number. */
function createHistory() {
    const values: number[] = [];
    const apply = (edit: TrackEdit) => {
        if (edit.type === 'add') {
            edit.objects.forEach(({ uid }) => values.push(Number(uid)));
        } else if (edit.type === 'remove') {
            edit.objects.forEach(({ uid }) => values.splice(values.lastIndexOf(Number(uid)), 1));
        } else if (edit.type === 'group') {
            edit.edits.forEach(apply);
        }
    };
    const history = new HistoryManager(apply);
    const add = (value: number) => {
        const edit: TrackEdit = {
            type: 'add',
            objects: [{ uid: String(value), layer: 'L0', kind: 'solid', code: '' }],
        };
        apply(edit);
        history.push(edit);
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
