import { DEFAULT_BIKE } from '../bike/bike.constants';
import type { TrackLayerType } from '../track/track-layer';

/** Content of a layer, each section in the entity format of the track codes. */
export interface LayerDocument {
    name: string;
    type: TrackLayerType;
    /** Whether the editor displays the layer. */
    visible: boolean;
    /** Solid lines: polylines of base 32 `x y` points, separated by `,`. */
    solid: string;
    /** Scenery lines, in the same format as the solid lines. */
    scenery: string;
    /** Items, separated by `,`; always empty for foreground layers, which have no physics. */
    items: string;
}

/** Content of a track, in either format, layer by layer. */
export interface TrackDocument {
    /** Layers from the bottom one to the top one, with at least one main layer. */
    layers: LayerDocument[];
    /** Name of the bike. */
    bike: string;
    /** Start position, as base 32 `x y`. */
    origin: string;
}

/** `format` field of the editor files. */
export const EDITOR_FORMAT = 'openrider-editor',
    /** Version of the editor files written by this version of the game. */
    EDITOR_VERSION = 1,
    /** Origin of a track that does not give one. */
    DEFAULT_ORIGIN = '0 0';

/** Names of the two layers of a track code, read into the editor format. */
const TRACK_CODE_LAYERS = { main: 'Main', foreground: 'Foreground' } as const;

/**
 * Reads and writes the two track formats.
 *
 * - **Track codes**, the format of the original game:
 *   `solid#scenery#items#foreground solid#foreground scenery#bike#origin`. They hold one main
 *   and one foreground layer, so writing a track code merges the main layers together, and the
 *   foreground layers together, in stack order.
 * - **Editor files**: JSON holding every layer with its name, type and visibility, each layer
 *   keeping its lines and items in the sections format of the track codes:
 *   `{"format":"openrider-editor","version":1,"bike":"BMX","origin":"0 0","layers":[…]}`.
 *
 * Both are read into a {@link TrackDocument}; a track code becomes a main and a foreground layer.
 */
export abstract class TrackFormat {
    /** Whether a code is an editor file rather than a track code, which never starts with `{`. */
    public static isEditorCode(code: string): boolean {
        return code.trimStart().startsWith('{');
    }

    /**
     * Reads a track code or an editor file.
     *
     * @throws When an editor file is invalid; track codes are always readable.
     */
    public static read(code: string): TrackDocument {
        return TrackFormat.isEditorCode(code)
            ? TrackFormat.readEditorCode(code)
            : TrackFormat.readTrackCode(code);
    }

    /**
     * Reads a track code into a main and a foreground layer. Missing trailing sections fall back
     * to empty sections, the default bike and the origin.
     */
    public static readTrackCode(code: string): TrackDocument {
        const [solid, scenery, items, foregroundSolid, foregroundScenery, bike, origin] =
            code.split('#');

        return {
            layers: [
                TrackFormat.layer('main', TRACK_CODE_LAYERS.main, solid, scenery, items),
                TrackFormat.layer(
                    'foreground',
                    TRACK_CODE_LAYERS.foreground,
                    foregroundSolid,
                    foregroundScenery,
                ),
            ],
            bike: bike || DEFAULT_BIKE.bikeName,
            origin: origin || DEFAULT_ORIGIN,
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

        if (!TrackFormat.isRecord(data) || data.format !== EDITOR_FORMAT) {
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
                !TrackFormat.isRecord(layer) ||
                !['main', 'foreground'].includes(layer.type as string)
            ) {
                throw new Error(`Invalid layer #${index + 1} in the editor file`);
            }
            const type = layer.type as TrackLayerType;
            const name =
                typeof layer.name === 'string' && layer.name ? layer.name : `Layer ${index + 1}`;
            return {
                ...TrackFormat.layer(
                    type,
                    name,
                    TrackFormat.section(layer.solid),
                    TrackFormat.section(layer.scenery),
                    TrackFormat.section(layer.items),
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
            origin: typeof data.origin === 'string' && data.origin ? data.origin : DEFAULT_ORIGIN,
        };
    }

    /** Writes a track code, merging the main layers and the foreground layers. */
    public static toTrackCode(document: TrackDocument): string {
        const merge = (type: TrackLayerType, section: 'solid' | 'scenery' | 'items') =>
            TrackFormat.merge(
                document.layers
                    .filter((layer) => layer.type === type)
                    .map((layer) => layer[section]),
            );

        return [
            merge('main', 'solid'),
            merge('main', 'scenery'),
            merge('main', 'items'),
            merge('foreground', 'solid'),
            merge('foreground', 'scenery'),
            document.bike,
            document.origin,
        ].join('#');
    }

    /** Writes an editor file, as compact JSON. */
    public static toEditorCode(document: TrackDocument): string {
        return JSON.stringify({
            format: EDITOR_FORMAT,
            version: EDITOR_VERSION,
            bike: document.bike,
            origin: document.origin,
            layers: document.layers.map(({ name, type, visible, solid, scenery, items }) => ({
                name,
                type,
                visible,
                solid,
                scenery,
                items,
            })),
        });
    }

    /** Concatenates sections, each entity being followed by a `,` as the generator writes them. */
    private static merge(sections: string[]): string {
        return sections
            .map((section) => section.replace(/,+$/, ''))
            .filter(Boolean)
            .map((section) => `${section},`)
            .join('');
    }

    private static layer(
        type: TrackLayerType,
        name: string,
        solid = '',
        scenery = '',
        items = '',
    ): LayerDocument {
        // Items need physics: a foreground layer never holds any
        return { name, type, visible: true, solid, scenery, items: type === 'main' ? items : '' };
    }

    private static section(value: unknown): string {
        return typeof value === 'string' ? value : '';
    }

    private static isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}
