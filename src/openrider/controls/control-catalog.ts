import { Control } from 'canvade';
import { PLAYER_CONTROLS } from '../bike/runner/player-runner';
import type { ToolClass } from '../tool/tool';
import {
    LEFT_TOOLBAR_EDITING,
    LEFT_TOOLBAR_ENDURANCE,
    LEFT_TOOLBAR_VIEWING,
    RIGHT_TOOLBAR,
    ToolbarEntries,
} from '../tool/toolbar.constants';
import { ControlBindings } from './control-bindings';

/** A control of the game, as listed in the controls panel. */
export interface ControlEntry {
    /** Name of the control in the keyboard. */
    name: string;
    /** Label shown in the panel. */
    label: string;
    defaultControl: Control;
}

/** Controls listed under a title in the controls panel. */
export interface ControlSection {
    title: string;
    entries: ControlEntry[];
}

/** A screen of the game: its toolbars, whose tools are active at once. */
interface ControlContext {
    title: string;
    toolbars: ToolbarEntries[];
}

/** Screens of the game riding the bike, each one with its toolbars. */
const CONTEXTS: ControlContext[] = [
    { title: 'Racing', toolbars: [LEFT_TOOLBAR_VIEWING] },
    { title: 'Endurance', toolbars: [LEFT_TOOLBAR_ENDURANCE] },
    { title: 'Editor', toolbars: [LEFT_TOOLBAR_EDITING, RIGHT_TOOLBAR] },
];

/**
 * Every control of the game: riding the bike, and the shortcuts of the tools of each screen,
 * listed by the controls panel and checked for conflicts.
 *
 * Two controls conflict when a same key triggers them on a same screen: a key can run a tool in
 * the editor and another one in endurance mode, but not two tools of the editor. Riding the bike
 * is possible on every screen.
 */
export abstract class ControlCatalog {
    /**
     * Sections of the panel: riding, then the tools of each screen not listed before, with
     * their default keys declared in the bindings.
     */
    public static sections(): ControlSection[] {
        const riding: ControlSection = {
            title: 'Riding',
            entries: PLAYER_CONTROLS.map(({ name, label, key }) => ({
                name,
                label,
                defaultControl: key,
            })),
        };
        const listed = new Set(riding.entries.map((entry) => entry.name));
        const sections = [riding];

        for (const context of CONTEXTS) {
            const entries = ControlCatalog.toolsOf(context)
                .filter((toolClass) => !listed.has(toolClass.toolName))
                .map(ControlCatalog.toolEntry);
            entries.forEach((entry) => listed.add(entry.name));
            if (entries.length > 0) {
                sections.push({ title: context.title, entries });
            }
        }

        for (const { entries } of sections) {
            entries.forEach(({ name, defaultControl }) =>
                ControlBindings.declare(name, defaultControl),
            );
        }
        return sections;
    }

    /**
     * Labels of the controls triggered by the key of a control on a same screen, e.g. to warn
     * that a key was bound twice.
     */
    public static conflicts(name: string): string[] {
        const control = ControlBindings.get(name);
        if (!control) {
            return [];
        }

        const entries = ControlCatalog.sections().flatMap((section) => section.entries);
        const contexts = ControlCatalog.contextsOf(name);
        return entries
            .filter(
                (entry) =>
                    entry.name !== name &&
                    ControlCatalog.contextsOf(entry.name).some((context) =>
                        contexts.includes(context),
                    ) &&
                    ControlBindings.get(entry.name)?.overlaps(control),
            )
            .map((entry) => entry.label);
    }

    /** Screens where a control is active: every screen for the riding controls. */
    private static contextsOf(name: string): ControlContext[] {
        if (PLAYER_CONTROLS.some((control) => control.name === name)) {
            return CONTEXTS;
        }
        return CONTEXTS.filter((context) =>
            ControlCatalog.toolsOf(context).some((toolClass) => toolClass.toolName === name),
        );
    }

    /** Tools of a screen with a shortcut, the tools of the groups after their group. */
    private static toolsOf(context: ControlContext): ToolClass[] {
        return context.toolbars
            .flat()
            .flatMap((toolClass) =>
                toolClass
                    ? [
                          toolClass,
                          ...((toolClass as ToolClass & { toolClasses?: ToolClass[] })
                              .toolClasses ?? []),
                      ]
                    : [],
            )
            .filter((toolClass) => toolClass.key !== null);
    }

    private static toolEntry(toolClass: ToolClass): ControlEntry {
        return {
            name: toolClass.toolName,
            label: toolClass.toolName,
            defaultControl: toolClass.key as Control,
        };
    }
}
