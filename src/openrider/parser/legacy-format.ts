import { DEFAULT_BIKE } from '../bike/bike.constants';
import type { TrackLayerType } from '../track/track-layer';
import {
    emptyLayer,
    type ItemEntity,
    type LayerDocument,
    parseItem,
    type Polyline,
    type TrackDocument,
} from './track-document';

/** `format` field of the original editor files. */
export const EDITOR_FORMAT = 'openrider-editor',
    /** Last version of the original editor files. */
    EDITOR_VERSION = 1;

/** Names of the two layers of a track code, read as a document. */
export const TRACK_CODE_LAYERS = { main: 'Main', foreground: 'Foreground' } as const;

/**
 * Reads the original text formats, converted to the binary format of `TrackFormat` from then on:
 * the tracks of the older versions, of Free Rider, and the files saved before.
 *
 * - **Track codes**: `solid#scenery#items#foreground solid#foreground scenery#bike#origin`, each
 *   section holding entities separated by `,`: polylines of base 32 `x y` points, or items as
 *   their letter followed by their base 32 values. They hold a main and a foreground layer.
 * - **Editor files**: JSON holding every layer with its name, type and visibility, each layer
 *   keeping its lines and items in the sections format of the track codes:
 *   `{"format":"openrider-editor","version":1,"bike":"BMX","origin":"0 0","layers":[…]}`.
 *
 * Their scenery is the grey of the original scenery, color 0.
 */
export abstract class LegacyFormat {
    /** Whether a text is an editor file rather than a track code, which never starts with `{`. */
    public static isEditorCode(code: string): boolean {
        return code.trimStart().startsWith('{');
    }

    /**
     * Reads a track code or an editor file.
     *
     * @throws When an editor file is invalid; track codes are always readable.
     */
    public static read(code: string): TrackDocument {
        return LegacyFormat.isEditorCode(code)
            ? LegacyFormat.readEditorCode(code)
            : LegacyFormat.readTrackCode(code);
    }

    /**
     * Reads a track code into a main and a foreground layer. Missing trailing sections fall back
     * to empty sections, the default bike and the origin; malformed entities are skipped.
     */
    public static readTrackCode(code: string): TrackDocument {
        const [solid, scenery, items, foregroundSolid, foregroundScenery, bike, origin] =
            code.split('#');

        return {
            layers: [
                LegacyFormat.layer('main', TRACK_CODE_LAYERS.main, solid, scenery, items),
                LegacyFormat.layer(
                    'foreground',
                    TRACK_CODE_LAYERS.foreground,
                    foregroundSolid,
                    foregroundScenery,
                ),
            ],
            bike: bike?.trim() || DEFAULT_BIKE.bikeName,
            origin: LegacyFormat.origin(origin),
        };
    }

    /**
     * Reads an editor file. Missing optional fields get their defaults: visible layers, empty
     * sections, the default bike and the origin.
     *
     * @throws When the file is not valid JSON, not an editor file, of a newer version, or has
     * no main layer.
     */
    public static readEditorCode(code: string): TrackDocument {
        let data: unknown;
        try {
            data = JSON.parse(code);
        } catch {
            throw new Error('The editor file is not valid JSON');
        }

        if (!LegacyFormat.isRecord(data) || data.format !== EDITOR_FORMAT) {
            throw new Error('Not an OpenRider editor file');
        }
        if (typeof data.version !== 'number' || data.version > EDITOR_VERSION) {
            throw new Error(`Unsupported editor file version: ${String(data.version)}`);
        }
        if (!Array.isArray(data.layers)) {
            throw new Error('The editor file has no layers');
        }

        const layers = data.layers.map((layer: unknown, index: number) => {
            if (
                !LegacyFormat.isRecord(layer) ||
                !['main', 'foreground'].includes(layer.type as string)
            ) {
                throw new Error(`Invalid layer #${index + 1} in the editor file`);
            }
            const type = layer.type as TrackLayerType;
            const name =
                typeof layer.name === 'string' && layer.name ? layer.name : `Layer ${index + 1}`;
            return {
                ...LegacyFormat.layer(
                    type,
                    name,
                    LegacyFormat.section(layer.solid),
                    LegacyFormat.section(layer.scenery),
                    LegacyFormat.section(layer.items),
                ),
                visible: layer.visible !== false,
            };
        });

        if (!layers.some((layer) => layer.type === 'main')) {
            throw new Error('The editor file has no main layer');
        }

        return {
            layers,
            bike: typeof data.bike === 'string' && data.bike ? data.bike : DEFAULT_BIKE.bikeName,
            origin: LegacyFormat.origin(typeof data.origin === 'string' ? data.origin : ''),
        };
    }

    /**
     * Reads the polylines of a section. A point that is no base 32 integers ends its polyline,
     * the next valid point starting another one, and a polyline needs two points.
     */
    public static polylines(section = ''): Polyline[] {
        const polylines: Polyline[] = [];
        for (const entity of section.split(',')) {
            const values = entity.trim().split(/\s+/);
            let polyline: Polyline = [];
            const flush = () => {
                if (polyline.length >= 4) {
                    polylines.push(polyline);
                }
                polyline = [];
            };
            for (let i = 0; i + 1 < values.length; i += 2) {
                const x = parseInt(values[i], 32);
                const y = parseInt(values[i + 1], 32);
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    polyline.push(x, y);
                } else {
                    flush();
                }
            }
            flush();
        }
        return polylines;
    }

    /** Reads the items of a section, skipping those without a position. */
    public static items(section = ''): ItemEntity[] {
        return section
            .split(',')
            .map((entity) => parseItem(entity.trim()))
            .filter((entity): entity is ItemEntity => entity !== null);
    }

    private static layer(
        type: TrackLayerType,
        name: string,
        solid = '',
        scenery = '',
        items = '',
    ): LayerDocument {
        const sceneryPolylines = LegacyFormat.polylines(scenery);
        return {
            ...emptyLayer(type, name),
            solid: LegacyFormat.polylines(solid),
            scenery: sceneryPolylines.length ? [{ color: 0, polylines: sceneryPolylines }] : [],
            // Items need physics: a foreground layer never holds any
            items: type === 'main' ? LegacyFormat.items(items) : [],
        };
    }

    /** Reads a base 32 `x y` origin, an invalid coordinate being 0. */
    private static origin(origin = ''): { x: number; y: number } {
        const [x = '', y = ''] = origin.trim().split(/\s+/);
        return { x: parseInt(x, 32) || 0, y: parseInt(y, 32) || 0 };
    }

    private static section(value: unknown): string {
        return typeof value === 'string' ? value : '';
    }

    private static isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}
