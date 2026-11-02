import { EventFactory, UIElement } from 'canvade';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SelectTool } from '../../src/openrider/tool/misc/select.tool';
import { STATE_TRACK_EDITING, STATE_TRACK_FETCHER } from '../../src/states/state-names';
import { createCanvasMock } from '../helpers/canvas';
import { manager, mouseEvent, runUntil, session, useGame } from './game-helpers';

useGame();

/** Templates of the website, by section. */
const TEMPLATES = {
    mine: [
        { ID: 1, NAME: 'Loop', OBJECTS: 12, PUBLIC: true, AUTHOR: 'Me', MINE: true },
        { ID: 2, NAME: 'Ramp', OBJECTS: 3, PUBLIC: false, AUTHOR: 'Me', MINE: true },
    ],
    public: [
        { ID: 1, NAME: 'Loop', OBJECTS: 12, PUBLIC: true, AUTHOR: 'Me', MINE: true },
        { ID: 7, NAME: 'Castle', OBJECTS: 80, PUBLIC: true, AUTHOR: 'Ann', MINE: false },
    ],
};

describe('Template panel', () => {
    let posted: Array<Record<string, string>>;
    let tool: SelectTool;

    /** Renders a frame, returning the texts drawn. */
    const frame = () => {
        const { context } = createCanvasMock();
        manager.update(0.5, 20);
        manager.render(context);
        return vi.mocked(context.fillText).mock.calls.map(([text]) => String(text));
    };
    /** Element of the interface, the first one of a class. */
    const element = (className: string) => {
        const root = manager.getCurrent()?.layers.get('interface')?.uiRenderer.getRootElement();
        const descendants = (parent: UIElement): UIElement[] => [
            parent,
            ...parent.children.flatMap(descendants),
        ];
        return root && descendants(root).find((child) => child.classNames.includes(className));
    };
    /** Clicks the middle of an element of the interface with the mouse. */
    const click = (className: string) => {
        const bounds = element(className)?.getBounds();
        if (!bounds) throw new Error(`No element .${className}`);
        const [x, y] = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
        for (const name of ['pointerDown', 'pointerUp'] as const) {
            manager.getCurrent()?.dispatch(name, mouseEvent(name, x, y));
        }
    };
    const press = (key: string) => {
        const event = EventFactory.createGameEvent({
            name: 'keyDown',
            consumed: false,
            keyboardEvent: {
                key,
                code: key,
                ctrlKey: false,
                altKey: false,
                shiftKey: false,
                metaKey: false,
            } as KeyboardEvent,
        });
        manager.getCurrent()?.dispatch('keyDown', event);
        return event.detail.consumed;
    };
    /** Lets the requests answer. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

    beforeEach(async () => {
        posted = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
                const params = Object.fromEntries(init.body.entries());
                posted.push(params);
                const rows = TEMPLATES[params.section as 'mine' | 'public'] ?? [];
                const found = rows
                    .filter(({ NAME }) => NAME.toLowerCase().includes(params.query ?? ''))
                    .map((row) => ({ ...row, THUMBNAIL: `/templates/${row.ID}/thumbnail/` }));
                const body =
                    params.action === 'list' ? { TEMPLATES: found } : { CODE: '0 0 a 0##T 0 -a' };
                return new Response(JSON.stringify(body));
            }),
        );
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        tool = session.track.toolCollection.getByToolName(SelectTool.toolName) as SelectTool;
        session.track.toolManager.setTool(tool);
        // The size of the canvas known, as once the game is shown
        frame();
    });

    test('shows the templates of the player as cards with their thumbnail', async () => {
        await tool.browseTemplates();
        const texts = frame();

        expect(texts).toEqual(
            expect.arrayContaining([
                'Your templates',
                'Public templates',
                'Loop',
                '12 objects · public',
            ]),
        );
        expect(texts).toContain('3 objects');
        expect(element('templates-thumbnail-1')?.v('src')).toBe('/templates/2/thumbnail/');
        // The cards without template are hidden, and cannot be tapped
        expect(element('templates-card-2')?.v('pointerEvents')).toBe('none');
        expect(element('templates-thumbnail-2')?.v('src')).toBe('');
    });

    test('shows the public templates with their author', async () => {
        await tool.browseTemplates();
        frame();

        click('templates-tab-public');
        await settle();
        const texts = frame();

        expect(posted.at(-1)).toMatchObject({ action: 'list', section: 'public' });
        expect(texts).toEqual(expect.arrayContaining(['Castle', '80 objects · by Ann']));
    });

    test('search as typed, the field keeping the focus', async () => {
        await tool.browseTemplates();
        frame();
        const search = element('templates-search');
        expect(search?.isFocused()).toBe(true);

        for (const key of 'ram') {
            expect(press(key)).toBe(true);
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
        const texts = frame();

        expect(posted.at(-1)).toMatchObject({ section: 'mine', query: 'ram' });
        expect(texts).toContain('Ramp');
        expect(texts).not.toContain('Loop');
        // Shown in place: the same field, still focused
        expect(element('templates-search') === search).toBe(true);
        expect(search?.isFocused()).toBe(true);
    });

    test('paste the template tapped, closing', async () => {
        await tool.browseTemplates();
        frame();

        click('templates-card-1');
        await settle();

        expect(posted.at(-1)).toMatchObject({ action: 'get', id: '2' });
        expect(tool.pasted).toHaveLength(2);
        expect(frame()).not.toContain('Your templates');
    });

    test('close with Escape, the close button or a tap around', async () => {
        for (const close of [
            () => press('Escape'),
            () => click('templates-close'),
            () => {
                for (const name of ['pointerDown', 'pointerUp'] as const) {
                    manager.getCurrent()?.dispatch(name, mouseEvent(name, 5, 395));
                }
            },
        ]) {
            await tool.browseTemplates();
            expect(frame()).toContain('Your templates');
            close();
            expect(tool.templates.open).toBe(false);
            expect(frame()).not.toContain('Your templates');
        }
    });
});
