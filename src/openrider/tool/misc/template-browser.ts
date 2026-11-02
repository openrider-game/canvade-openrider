import { ClipObject, ObjectClipboard } from '../../edit/object-clipboard';
import { templateThumbnail } from '../../edit/template-thumbnail';
import type { TrackObject } from '../../item/track-object';
import { TemplateSection, TemplateService, TemplateSummary } from '../../request/template-service';
import type { Track } from '../../track/track';
import type { ToolOption } from '../tool';

/** Longest name of a template, as the website takes them. */
const TEMPLATE_NAME_LENGTH = 60,
    /** Time without typing after which the templates are searched, in milliseconds. */
    SEARCH_DELAY = 300;

/** Titles of the sections of the templates, by section. */
export const TEMPLATE_SECTIONS: Record<TemplateSection, string> = {
    mine: 'Your templates',
    public: 'Public templates',
};

/** What the template browser asks of the select tool. */
export interface TemplateHost {
    /** Shows the message of the last action in the options, null to clear it. */
    notify(notice: string | null): void;
    /** Starts pasting objects, e.g. of a template. */
    paste(objects: readonly ClipObject[]): void;
}

/**
 * Templates of the select tool, with the website (see `TemplateService`): saves a selection as a
 * template, private or public, and browses the templates to paste one.
 *
 * The templates are browsed in a panel over the track (see `TemplatePanel`), by section: the
 * templates of the player, private or public, or every public template. The search, typed in the
 * panel, is sent once the typing pauses; the templates found are shown a page at a time, of
 * {@link TemplateBrowser.pageSize} templates as many as the panel holds.
 *
 * Its state changes in two ways: those changing the layout of the panel, as opening it or another
 * section, rebuild the interface (`Track.invalidateUI`); the templates found and the pages only
 * change {@link TemplateBrowser.version}, the panel showing them in place, so that the field of
 * the search keeps the focus, and the keyboard of a phone stays open.
 */
export class TemplateBrowser {
    /** Whether the panel is open. */
    public open = false;
    /** Section browsed. */
    public section: TemplateSection = 'mine';
    /** Search typed, empty for every template. */
    public query = '';
    /** Templates found in the section, null until they are. */
    public results: TemplateSummary[] | null = null;
    /** Why no template is shown, e.g. while loading them, null when some are. */
    public status: string | null = null;
    /** Page shown, from 0. */
    public page = 0;
    /** Templates in a page, as many as the panel holds, set by it. */
    public pageSize = 6;
    /** Incremented each time the templates shown change, see the class comment. */
    public version = 0;
    /** Whether the next templates saved are public, else private. */
    private publicTemplates = false;
    /** Number of the last request, the answers of the earlier ones being outdated. */
    private request = 0;
    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    public constructor(
        private readonly track: Track,
        private readonly host: TemplateHost,
    ) {}

    /** Number of pages of the templates found, 1 at least. */
    public get pages(): number {
        return Math.max(1, Math.ceil((this.results?.length ?? 0) / this.pageSize));
    }

    /** Templates of the page shown. */
    public get shown(): TemplateSummary[] {
        const page = Math.min(this.page, this.pages - 1);
        return (this.results ?? []).slice(page * this.pageSize, (page + 1) * this.pageSize);
    }

    /** Opens the panel on the section browsed, loading its templates. */
    public browse(): Promise<void> {
        this.open = true;
        this.track.invalidateUI();
        return this.load();
    }

    /** Closes the panel. */
    public close(): void {
        this.cancelSearch();
        if (this.open) {
            this.open = false;
            this.track.invalidateUI();
        }
    }

    /** Browses a section, from its first page. */
    public showSection(section: TemplateSection): Promise<void> {
        this.section = section;
        this.page = 0;
        // The tabs show the section
        this.track.invalidateUI();
        return this.load();
    }

    /** Searches the templates once the typing pauses, see {@link SEARCH_DELAY}. */
    public search(query: string): void {
        this.query = query;
        this.cancelSearch();
        this.searchTimer = setTimeout(() => {
            this.searchTimer = null;
            this.page = 0;
            void this.load();
        }, SEARCH_DELAY);
    }

    /** Turns the pages, the first one after the last one. */
    public turn(by: number): void {
        const pages = this.pages;
        this.page = (((this.page + by) % pages) + pages) % pages;
        this.version++;
    }

    /** Loads the templates of the section for the search, the latest request winning. */
    public async load(): Promise<void> {
        const request = ++this.request;
        this.status = 'Loading the templates…';
        this.version++;
        try {
            const results = await TemplateService.list(this.section, this.query);
            if (request !== this.request) {
                return;
            }
            this.results = results;
            this.status = results.length ? null : this.emptyStatus();
        } catch (error) {
            if (request !== this.request) {
                return;
            }
            this.results = [];
            this.status = (error as Error).message;
        }
        this.version++;
    }

    /**
     * Saves objects as a template, private or public as chosen in the options, named in a dialog
     * of the track (see `TrackDialogs`). Its thumbnail shows the area of the objects, see
     * `templateThumbnail`.
     */
    public async save(selected: readonly TrackObject[]): Promise<void> {
        const objects = ObjectClipboard.copy(selected);
        if (!objects.length) {
            return;
        }
        const name = (
            await this.track.dialogs.prompt('Name of the template', {
                confirm: 'Save',
                placeholder: 'Name',
                maxLength: TEMPLATE_NAME_LENGTH,
            })
        )?.trim();
        if (!name) {
            return;
        }
        try {
            await TemplateService.save(
                name,
                ObjectClipboard.toText(objects),
                this.publicTemplates,
                templateThumbnail(selected),
            );
            this.host.notify(`Saved the template ${name}`);
        } catch (error) {
            this.host.notify((error as Error).message);
        }
        this.track.invalidateUI();
    }

    /** Pastes a template: the panel closes, and the template follows the pointer. */
    public async insert(template: TemplateSummary): Promise<void> {
        this.close();
        try {
            const objects = ObjectClipboard.fromText(await TemplateService.code(template.id));
            if (objects === null) {
                this.host.notify(`The template ${template.name} cannot be read`);
            } else {
                this.host.paste(objects);
            }
        } catch (error) {
            this.host.notify((error as Error).message);
        }
        this.track.invalidateUI();
    }

    /** Options saving a selection: as a template, then whether it is public. */
    public saveOptions(selected: () => readonly TrackObject[]): ToolOption[] {
        return [
            { label: 'Save as template', action: () => void this.save(selected()) },
            {
                label: `Template: ${this.publicTemplates ? 'public' : 'private'}`,
                action: () => {
                    this.publicTemplates = !this.publicTemplates;
                    this.track.invalidateUI();
                },
            },
        ];
    }

    /** Why a section shows no template. */
    private emptyStatus(): string {
        if (this.query.trim()) {
            return `No template matches “${this.query.trim()}”`;
        }
        return this.section === 'mine'
            ? 'No template yet: select objects, then save them as a template'
            : 'No public template yet';
    }

    private cancelSearch(): void {
        if (this.searchTimer !== null) {
            clearTimeout(this.searchTimer);
            this.searchTimer = null;
        }
    }
}
