import { GameConfig } from '../config/game-config';
import { TEMPLATES_PATH } from '../constants/request.constants';
import { Requests } from './requests';

/** Template listed by the website, without its code. */
export interface TemplateSummary {
    id: number;
    name: string;
    /** Number of objects, each line of a polyline counted. */
    objects: number;
    /** Whether every account sees it, else only its own. */
    public: boolean;
    /** Name of its account. */
    author: string;
    /** Whether it is a template of the account of the player. */
    mine: boolean;
    /** URL of its thumbnail, a PNG of the size of the track thumbnails, null without one. */
    thumbnail: string | null;
}

/** Templates listed: those of the player, private or public, or every public one. */
export type TemplateSection = 'mine' | 'public';

/** Template as the endpoint answers it. */
interface TemplateRow {
    ID: number;
    NAME: string;
    OBJECTS: number;
    PUBLIC: boolean;
    AUTHOR: string;
    MINE: boolean;
    THUMBNAIL?: string | null;
}

/**
 * Templates of the website: objects saved by the accounts from the select tool, private or
 * public, to paste in the tracks they edit. Their code is written as the first three sections of a
 * track code (see `ObjectClipboard`).
 *
 * The endpoint belongs to the website, not to the backend shipped with the game: without it, the
 * requests fail, their error telling it.
 */
export abstract class TemplateService {
    /**
     * Templates the player sees, the newest first: those of a section, else those of the player
     * then the public ones of the others.
     *
     * @param query - Text the name of the template or of its author holds, whatever its case.
     */
    public static async list(
        section: TemplateSection | null = null,
        query = '',
    ): Promise<TemplateSummary[]> {
        const { TEMPLATES } = await Requests.postJson<{ TEMPLATES: TemplateRow[] }>(
            GameConfig.url(TEMPLATES_PATH),
            {
                action: 'list',
                ...(section === null ? {} : { section }),
                ...(query.trim() === '' ? {} : { query: query.trim() }),
            },
        );
        return TEMPLATES.map((row) => ({
            id: row.ID,
            name: row.NAME,
            objects: row.OBJECTS,
            public: row.PUBLIC,
            author: row.AUTHOR,
            mine: row.MINE,
            thumbnail: row.THUMBNAIL ?? null,
        }));
    }

    /** Code of a template the player sees. */
    public static async code(id: number): Promise<string> {
        const { CODE } = await Requests.postJson<{ CODE: string }>(GameConfig.url(TEMPLATES_PATH), {
            action: 'get',
            id,
        });
        return CODE;
    }

    /**
     * Saves a template of the player.
     *
     * @param thumbnail - Its thumbnail, as base64 PNG data of the size of the track thumbnails
     * (see `templateThumbnail`), or null without one.
     * @returns Its id.
     */
    public static async save(
        name: string,
        code: string,
        isPublic: boolean,
        thumbnail: string | null = null,
    ): Promise<number> {
        const { ID } = await Requests.postJson<{ ID: number }>(GameConfig.url(TEMPLATES_PATH), {
            action: 'save',
            name,
            code,
            public: isPublic ? 1 : 0,
            ...(thumbnail === null ? {} : { thumbnail }),
        });
        return ID;
    }
}
