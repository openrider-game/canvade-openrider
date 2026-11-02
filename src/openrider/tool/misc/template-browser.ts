import { ClipObject, ObjectClipboard } from '../../edit/object-clipboard';
import { templateThumbnail } from '../../edit/template-thumbnail';
import type { TrackObject } from '../../item/track-object';
import { TemplateService, TemplateSummary } from '../../request/template-service';
import type { Track } from '../../track/track';
import type { ToolOption } from '../tool';

/** Templates listed in each page of the options. */
const TEMPLATES_PER_PAGE = 6;

/** What the template browser asks of the select tool. */
export interface TemplateHost {
    /** Shows the message of the last action in the options, null to clear it. */
    notify(notice: string | null): void;
    /** Starts pasting objects, e.g. of a template. */
    paste(objects: readonly ClipObject[]): void;
}

/**
 * Templates of the select tool, with the website: saves a selection as a template, private or
 * public, and lists the templates of the player and the public ones in the options, a page at a
 * time, to paste one (see `TemplateService`).
 */
export class TemplateBrowser {
    /** Whether the next templates saved are public, else private. */
    private publicTemplates = false;
    /** Templates listed in the options, null while they are not browsed. */
    private templates: TemplateSummary[] | null = null;
    /** Page of the templates listed, from 0. */
    private page = 0;

    public constructor(
        private readonly track: Track,
        private readonly host: TemplateHost,
    ) {}

    /** Whether the templates are listed, the options of the tool then listing them. */
    public get browsing(): boolean {
        return this.templates !== null;
    }

    /** Stops listing the templates. */
    public close(): void {
        this.templates = null;
    }

    /**
     * Saves objects as a template, private or public as chosen in the options, named in a dialog
     * of the browser: a text field of the canvas would not open the keyboard of a phone. Its
     * thumbnail shows the area of the objects, see `templateThumbnail`.
     */
    public async save(selected: readonly TrackObject[]): Promise<void> {
        const objects = ObjectClipboard.copy(selected);
        if (!objects.length) {
            return;
        }
        const name = window.prompt('Name of the template')?.trim();
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

    /** Lists the templates of the player and the public ones in the options. */
    public async browse(): Promise<void> {
        this.templates = [];
        this.page = 0;
        this.host.notify('Loading the templates');
        this.track.invalidateUI();
        try {
            this.templates = await TemplateService.list();
            this.host.notify(this.templates.length ? null : 'No template yet');
        } catch (error) {
            this.host.notify((error as Error).message);
        }
        this.track.invalidateUI();
    }

    /** Pastes a template: it follows the pointer, as objects copied. */
    public async insert(template: TemplateSummary): Promise<void> {
        try {
            const objects = ObjectClipboard.fromText(await TemplateService.code(template.id));
            if (objects === null) {
                this.host.notify(`The template ${template.name} cannot be read`);
            } else {
                this.templates = null;
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

    /** Options listing a page of the templates, to paste one, with the pages around. */
    public listOptions(): ToolOption[] {
        const templates = this.templates ?? [];
        const pages = Math.max(1, Math.ceil(templates.length / TEMPLATES_PER_PAGE));
        const page = Math.min(this.page, pages - 1);
        const turn = (to: number) => {
            this.page = (to + pages) % pages;
            this.track.invalidateUI();
        };
        const options: ToolOption[] = [
            {
                label: 'Back',
                action: () => {
                    this.templates = null;
                    this.host.notify(null);
                    this.track.invalidateUI();
                },
            },
        ];
        const shown = templates.slice(page * TEMPLATES_PER_PAGE, (page + 1) * TEMPLATES_PER_PAGE);
        for (const template of shown) {
            const owner = template.mine
                ? template.public
                    ? ', public'
                    : ''
                : `, by ${template.author}`;
            options.push({
                label: `${template.name} (${template.objects}${owner})`,
                action: () => void this.insert(template),
            });
        }
        if (pages > 1) {
            options.push({
                label: `Page ${page + 1} / ${pages}`,
                action: () => turn(page + 1),
                steps: { down: () => turn(page - 1), up: () => turn(page + 1) },
            });
        }
        return options;
    }
}
