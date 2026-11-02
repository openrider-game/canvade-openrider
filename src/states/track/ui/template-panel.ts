import { UIElement, UIStructureDefinition, UIStyleDefinition } from 'canvade';
import type { TemplateSection, TemplateSummary } from '../../../openrider/request/template-service';
import { TEMPLATE_SECTIONS, TemplateBrowser } from '../../../openrider/tool/misc/template-browser';
import { fitText } from './text-measure';
import {
    UI_BACKDROP_COLOR,
    UI_BACKGROUND_COLOR,
    UI_BORDER_COLOR,
    UI_BORDER_WIDTH,
    UI_DISABLED_TEXT_COLOR,
    UI_SELECTED_BACKGROUND_COLOR,
    UI_SELECTED_TEXT_COLOR,
    uiMetrics,
} from './ui-theme';

/** Largest panel, and space kept around it on small canvases, in UI pixels. */
const MAX_WIDTH = 600,
    MAX_HEIGHT = 460,
    MARGIN = 8,
    PADDING = 10,
    GAP = 8,
    /** Space between the border of a card and its thumbnail and name. */
    CARD_PADDING = 4,
    /** Distance between the lines of the cards, as a multiple of their font size. */
    LINE_HEIGHT = 1.25,
    /** Smallest thumbnail, and most rows of cards, laid out from the height of the canvas. */
    MIN_THUMBNAIL_HEIGHT = 48,
    MAX_ROWS = 3,
    /** Ratio of the thumbnails, those of the track thumbnails: 500x300. */
    THUMBNAIL_RATIO = 0.6,
    SECTIONS: readonly TemplateSection[] = ['mine', 'public'],
    /** Placeholders of the search, the templates of the player all being theirs. */
    SEARCH_PLACEHOLDERS: Record<TemplateSection, string> = {
        mine: 'Search by name',
        public: 'Search by name or author',
    },
    SEARCH_LENGTH = 60;

/** Sets a property of an element, whatever its type, e.g. after the templates found changed. */
function set(element: UIElement | undefined, key: string, value: unknown): void {
    (element as unknown as { getProperty(key: string): { setValue(value: unknown): void } })
        ?.getProperty(key)
        .setValue(value);
}

/**
 * Panel of the templates of the select tool (see `TemplateBrowser`) in the interface of the
 * editor: over a shade covering the track, the tabs of the two sections, "Your templates" and
 * "Public templates", with a button closing it; the search; the cards of the templates of the page,
 * their thumbnail over their name, a tap on one pasting it; and the pages, with the status of the
 * search.
 *
 * The panel fits the canvas: three columns of cards, or two on narrow canvases, and as many rows
 * as its height holds, setting the size of the pages of the browser. Its elements are built with
 * the interface; the templates found then fill the cards in place (see
 * {@link TemplatePanel.refresh}), without building the interface again, so that the search keeps
 * the focus while typed, and the keyboard of a phone stays open.
 */
export class TemplatePanel {
    /** Class of the field of the search, focused once the panel opens. */
    public static readonly SEARCH_CLASS = 'templates-search';

    /** Browser shown by the panel as last built, null while closed. */
    private browser: TemplateBrowser | null = null;
    /** Elements of the panel as last built, by class. */
    private readonly elements = new Map<string, UIElement>();
    /** Version of the browser the cards show, see `TemplateBrowser.version`. */
    private shownVersion = -1;
    /** Width of the names of the cards, and their font size, to cut the long ones. */
    private labelWidth = 0;
    private labelSize = 0;

    /** Field of the search, once built. */
    public get search(): UIElement | undefined {
        return this.elements.get(TemplatePanel.SEARCH_CLASS);
    }

    /**
     * Adds the panel of a browser to an interface being built, or forgets it without one.
     *
     * @param width - Width of the canvas, in UI pixels.
     * @param height - Height of the canvas, in UI pixels.
     */
    public build(
        browser: TemplateBrowser | null,
        structure: UIStructureDefinition,
        styles: UIStyleDefinition,
        width: number,
        height: number,
    ): void {
        this.browser = browser;
        this.elements.clear();
        this.shownVersion = -1;
        if (!browser) {
            return;
        }

        const { fontSize, actionHeight } = uiMetrics();
        const panelWidth = Math.max(240, Math.min(MAX_WIDTH, width - 2 * MARGIN));
        const innerWidth = panelWidth - 2 * PADDING;
        const columns = innerWidth >= 420 ? 3 : 2;
        const cardWidth = (innerWidth - (columns - 1) * GAP) / columns;
        const labelSize = fontSize - 2;
        const labelHeight = Math.ceil(2 * labelSize * LINE_HEIGHT);
        // Border, padding, and the gap between the thumbnail and the name
        const cardChrome = labelHeight + 2 * CARD_PADDING + 2 * UI_BORDER_WIDTH + 2;
        const gridSpace =
            Math.max(200, Math.min(MAX_HEIGHT, height - 2 * MARGIN)) -
            2 * PADDING -
            3 * actionHeight -
            3 * GAP;
        const rows = Math.max(
            1,
            Math.min(
                MAX_ROWS,
                Math.floor((gridSpace + GAP) / (cardChrome + MIN_THUMBNAIL_HEIGHT + GAP)),
            ),
        );
        const cardHeight = Math.min(
            cardWidth * THUMBNAIL_RATIO + cardChrome,
            (gridSpace - (rows - 1) * GAP) / rows,
        );
        const gridHeight = rows * cardHeight + (rows - 1) * GAP;
        browser.pageSize = columns * rows;
        this.labelWidth = cardWidth - 2 * CARD_PADDING - 2 * UI_BORDER_WIDTH;
        this.labelSize = labelSize;

        const cards = (row: number) =>
            Array.from({ length: columns }, (_, column) => {
                const index = row * columns + column;
                return {
                    [`container.templates-card.templates-card-${index}`]: {
                        children: [
                            `image.templates-thumbnail.templates-thumbnail-${index}`,
                            `text.templates-label.templates-label-${index}`,
                        ],
                        events: {
                            click: () => {
                                const template = browser.shown[index];
                                if (template) {
                                    void browser.insert(template);
                                }
                            },
                        },
                    },
                };
            });
        // Tapping around the panel closes it
        structure.push({
            'container.overlay.templates-backdrop': {
                children: [],
                events: { click: () => browser.close() },
            },
        });
        structure.push({
            'container.overlay.panel.templates': [
                {
                    'container.templates-header': [
                        ...SECTIONS.map((section) => ({
                            [`button.templates-tab-${section}`]: {
                                events: { click: () => void browser.showSection(section) },
                            },
                        })),
                        { 'button.templates-close': { events: { click: () => browser.close() } } },
                    ],
                },
                {
                    [`input.${TemplatePanel.SEARCH_CLASS}`]: {
                        events: { change: (query: string) => browser.search(query) },
                    },
                },
                {
                    'container.templates-grid': Array.from({ length: rows }, (_, row) => ({
                        [`container.templates-row`]: cards(row),
                    })),
                },
                {
                    'container.templates-footer': [
                        {
                            'button.templates-previous': {
                                events: { click: () => browser.turn(-1) },
                            },
                        },
                        'button.templates-status',
                        { 'button.templates-next': { events: { click: () => browser.turn(1) } } },
                    ],
                },
            ],
        });

        const row = (rowHeight: number) => ({
            pointerEvents: 'none',
            flexDirection: 'row',
            gap: GAP,
            width: '100%',
            height: rowHeight,
        });
        const tabWidth = (innerWidth - actionHeight - SECTIONS.length * GAP) / SECTIONS.length;
        const pageWidth = Math.round(actionHeight * 1.5);
        Object.assign(styles, {
            '.templates-backdrop': {
                x: 0,
                y: 0,
                width: '100%',
                height: '100%',
                backgroundColor: UI_BACKDROP_COLOR,
            },
            '.templates': {
                horizontalAlign: 'center',
                verticalAlign: 'middle',
                width: panelWidth,
                height: 2 * PADDING + 3 * actionHeight + 3 * GAP + gridHeight,
                padding: PADDING,
                gap: GAP,
            },
            '.templates-header': row(actionHeight),
            '.templates-close': { text: '✕', width: actionHeight, height: actionHeight },
            [`.${TemplatePanel.SEARCH_CLASS}`]: {
                value: browser.query,
                placeholder: SEARCH_PLACEHOLDERS[browser.section],
                maxLength: SEARCH_LENGTH,
                width: '100%',
                height: actionHeight,
            },
            '.templates-grid': {
                pointerEvents: 'none',
                flexDirection: 'column',
                gap: GAP,
                width: '100%',
                height: gridHeight,
            },
            '.templates-row': row(cardHeight),
            // Every property refreshed in place declared, as the elements only have the declared ones
            '.templates-card': {
                color: UI_BORDER_COLOR,
                backgroundColor: UI_BACKGROUND_COLOR,
                flexDirection: 'column',
                padding: CARD_PADDING,
                gap: 2,
                borderWidth: UI_BORDER_WIDTH,
                width: cardWidth,
                height: cardHeight,
            },
            '.templates-thumbnail': {
                pointerEvents: 'none',
                fit: 'contain',
                width: '100%',
                height: cardHeight - cardChrome,
            },
            '.templates-label': {
                pointerEvents: 'none',
                color: UI_BORDER_COLOR,
                fontSize: labelSize,
                lineHeight: LINE_HEIGHT,
                textAlign: 'center',
                width: '100%',
                height: labelHeight,
            },
            '.templates-footer': row(actionHeight),
            '.templates-previous': {
                text: '◀',
                textColor: UI_BORDER_COLOR,
                width: pageWidth,
                height: actionHeight,
            },
            '.templates-next': {
                text: '▶',
                textColor: UI_BORDER_COLOR,
                width: pageWidth,
                height: actionHeight,
            },
            // A text centered as the buttons, without border nor background
            '.templates-status': {
                pointerEvents: 'none',
                color: 'transparent',
                backgroundColor: 'transparent',
                hoverBackgroundColor: 'transparent',
                textColor: UI_BORDER_COLOR,
                width: innerWidth - 2 * pageWidth - 2 * GAP,
                height: actionHeight,
            },
        });
        for (const section of SECTIONS) {
            const selected = section === browser.section;
            styles[`.templates-tab-${section}`] = {
                text: TEMPLATE_SECTIONS[section],
                width: tabWidth,
                height: actionHeight,
                ...(selected
                    ? {
                          backgroundColor: UI_SELECTED_BACKGROUND_COLOR,
                          hoverBackgroundColor: UI_SELECTED_BACKGROUND_COLOR,
                          textColor: UI_SELECTED_TEXT_COLOR,
                      }
                    : {}),
            };
        }
    }

    /** Takes the elements of the panel built in the interface, then shows the templates found. */
    public attach(root: UIElement): void {
        if (!this.browser) {
            return;
        }
        const visit = (element: UIElement) => {
            const name = element.classNames.find(
                (className) =>
                    className.startsWith('templates-') &&
                    /-(\d+|mine|public)$|search|status|previous|next/.test(className),
            );
            if (name) {
                this.elements.set(name, element);
            }
            element.children.forEach(visit);
        };
        visit(root);
        this.refresh();
    }

    /**
     * Shows the templates of the page in the cards, the empty cards hidden, and the page or the
     * status of the search, when they changed since: called on each update.
     */
    public refresh(): void {
        const browser = this.browser;
        if (!browser || browser.version === this.shownVersion) {
            return;
        }
        this.shownVersion = browser.version;

        const shown = browser.shown;
        for (let index = 0; index < browser.pageSize; index++) {
            const template = shown[index];
            const card = this.elements.get(`templates-card-${index}`);
            set(card, 'color', template ? UI_BORDER_COLOR : 'transparent');
            set(card, 'backgroundColor', template ? UI_BACKGROUND_COLOR : 'transparent');
            set(card, 'pointerEvents', template ? 'auto' : 'none');
            set(
                this.elements.get(`templates-thumbnail-${index}`),
                'src',
                template?.thumbnail ?? '',
            );
            set(
                this.elements.get(`templates-label-${index}`),
                'text',
                template ? this.label(template) : '',
            );
        }

        const pages = browser.pages;
        set(
            this.elements.get('templates-status'),
            'text',
            browser.status ??
                (pages > 1 ? `Page ${Math.min(browser.page, pages - 1) + 1} / ${pages}` : ''),
        );
        set(
            this.elements.get('templates-status'),
            'textColor',
            browser.status ? UI_DISABLED_TEXT_COLOR : UI_BORDER_COLOR,
        );
        // The pages turn only when there are several
        for (const name of ['templates-previous', 'templates-next']) {
            const element = this.elements.get(name);
            set(element, 'pointerEvents', pages > 1 ? 'auto' : 'none');
            set(element, 'textColor', pages > 1 ? UI_BORDER_COLOR : UI_DISABLED_TEXT_COLOR);
        }
    }

    /**
     * Name of a template over its number of objects, and in the public templates its author, or
     * whether it is public in those of the player, each line cut to fit the card.
     */
    private label(template: TemplateSummary): string {
        const details =
            this.browser?.section === 'public'
                ? `${template.objects} objects · by ${template.author}`
                : `${template.objects} objects${template.public ? ' · public' : ''}`;
        return [template.name, details]
            .map((line) => fitText(line, this.labelWidth, this.labelSize))
            .join('\n');
    }
}
