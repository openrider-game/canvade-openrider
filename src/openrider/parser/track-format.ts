import { deflateSync, Inflate } from 'fflate';
import { DEFAULT_BIKE } from '../bike/bike.constants';
import { ByteReader, ByteWriter } from './byte-stream';
import { LegacyFormat, TRACK_CODE_LAYERS } from './legacy-format';
import {
    addScenery,
    emptyLayer,
    type ItemEntity,
    type LayerDocument,
    type Polyline,
    type TrackDocument,
} from './track-document';

/**
 * A track as the game passes it around: the bytes of a track file, or a text, the base 64 text
 * of a track file or a track of an original format (see `LegacyFormat`).
 */
export type TrackCode = string | Uint8Array;

/** First bytes of the track files, `OR`. */
const MAGIC = [0x4f, 0x52],
    /** Version of the track files written by this version of the game. */
    FORMAT_VERSION = 1,
    /** Flag of the header: an editor file, keeping the layers with their names. */
    EDITOR_FLAG = 1,
    /** Flags of a layer. */
    FOREGROUND_FLAG = 1,
    HIDDEN_FLAG = 2,
    /**
     * Largest body a track file inflates to, in bytes: far more than the largest tracks, but a
     * small file inflating to gigabytes is refused before filling the memory.
     */
    MAX_BODY_SIZE = 256 * 1024 * 1024;

/**
 * Reads and writes the track files, a compact binary format: a short header, readable as is,
 * then the layers compressed with deflate.
 *
 * Header:
 * - `O` `R`, then the format version, then the flags: {@link EDITOR_FLAG} for an editor file;
 * - the bike name, as a string: its UTF-8 length as a varint, then its bytes;
 * - the start position, as two signed varints.
 *
 * Body, compressed as raw deflate: the number of layers, then each layer:
 * - its flags ({@link FOREGROUND_FLAG}, {@link HIDDEN_FLAG}), then its name in editor files;
 * - its solid polylines;
 * - its scenery: the number of colors, then for each its color index and its polylines;
 * - for a main layer, its items: a table of the item kinds, each as its letter and its number of
 *   values, then the items, each as its index in the table followed by its values.
 *
 * Polylines are their number, then for each its number of points and its points. Every point,
 * and every item position, is the signed difference from the previous one of the section, the
 * first from 0 0: neighbor points mostly differ by a byte. Varints are those of `ByteWriter`.
 *
 * A track code holds a main and a foreground layer, written by {@link TrackFormat.toTrackCode}
 * merging the layers of each type, while an editor file keeps them all. Both travel as text,
 * base 64 encoded, until the server stores the bytes themselves.
 *
 * The original text formats are still read, see `LegacyFormat`: their scenery is grey.
 */
export abstract class TrackFormat {
    /**
     * Reads a track file or code, in any format: the bytes or their base 64 text, or one of the
     * original text formats.
     *
     * @throws When the track file or an original editor file is invalid; the original track codes
     * are always readable.
     */
    public static read(code: TrackCode): TrackDocument {
        const bytes = typeof code === 'string' ? TrackFormat.fromText(code) : code;
        if (bytes && TrackFormat.isBinary(bytes)) {
            return TrackFormat.decode(bytes);
        }
        return LegacyFormat.read(typeof code === 'string' ? code : new TextDecoder().decode(code));
    }

    /** Whether a track file or code, in any format, is an editor file keeping the layers. */
    public static isEditorCode(code: TrackCode): boolean {
        const bytes = typeof code === 'string' ? TrackFormat.fromText(code) : code;
        if (bytes && TrackFormat.isBinary(bytes)) {
            return (bytes[3] & EDITOR_FLAG) !== 0;
        }
        return LegacyFormat.isEditorCode(
            typeof code === 'string' ? code : new TextDecoder().decode(code.subarray(0, 64)),
        );
    }

    /** Writes a track code merging the layers of each type, as base 64 text. */
    public static toTrackCode(document: TrackDocument): string {
        return TrackFormat.toText(TrackFormat.encode(document, false));
    }

    /** Writes an editor file keeping the layers, as base 64 text. */
    public static toEditorCode(document: TrackDocument): string {
        return TrackFormat.toText(TrackFormat.encode(document, true));
    }

    /**
     * Writes a track file.
     *
     * @param editor - Whether to keep the layers with their names and visibility, else the main
     * and the foreground layers are merged into one of each, in stack order.
     */
    public static encode(document: TrackDocument, editor: boolean): Uint8Array<ArrayBuffer> {
        const header = new ByteWriter();
        header.raw(new Uint8Array([...MAGIC, FORMAT_VERSION, editor ? EDITOR_FLAG : 0]));
        header.string(document.bike);
        header.int(Math.round(document.origin.x));
        header.int(Math.round(document.origin.y));

        const layers = editor ? document.layers : TrackFormat.merge(document.layers);
        const body = new ByteWriter();
        body.uint(layers.length);
        for (const layer of layers) {
            TrackFormat.writeLayer(body, layer, editor);
        }

        header.raw(deflateSync(body.bytes, { level: 9 }));
        return header.bytes.slice();
    }

    /**
     * Reads a track file.
     *
     * @throws When the file is truncated or invalid, or of a newer version.
     */
    public static decode(bytes: Uint8Array): TrackDocument {
        if (!TrackFormat.isBinary(bytes)) {
            throw new Error('Not an OpenRider track file');
        }
        const header = new ByteReader(bytes.subarray(MAGIC.length));
        const version = header.byte();
        if (version > FORMAT_VERSION) {
            throw new Error(`Unsupported track file version: ${version}`);
        }
        const editor = (header.byte() & EDITOR_FLAG) !== 0;
        const bike = header.string() || DEFAULT_BIKE.bikeName;
        const origin = { x: header.int(), y: header.int() };

        const body = new ByteReader(TrackFormat.inflate(header.rest()));
        const layerCount = body.count();
        const layers: LayerDocument[] = [];
        for (let index = 0; index < layerCount; index++) {
            layers.push(TrackFormat.readLayer(body, editor, index));
        }
        if (!layers.some((layer) => layer.type === 'main')) {
            throw new Error('The track file has no main layer');
        }

        return { layers, bike, origin };
    }

    /**
     * Text of a track, to send it in JSON, e.g. to the ghost verifier: the base 64 text of a
     * track file, or the text of a track of an original format.
     */
    public static toCodeText(code: TrackCode): string {
        if (typeof code === 'string') {
            return code;
        }
        return TrackFormat.isBinary(code)
            ? TrackFormat.toText(code)
            : new TextDecoder().decode(code);
    }

    /** Base 64 text of a track file, to travel as text. */
    public static toText(bytes: Uint8Array): string {
        let binary = '';
        // By chunks: a call takes a limited number of arguments
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    }

    /** Bytes of the base 64 text of a track file, or null for a text in another format. */
    public static fromText(text: string): Uint8Array | null {
        // The base 64 text of `OR` and the version: no original format starts so, track codes
        // starting with lowercase base 32 numbers and editor files with `{`
        if (!text.startsWith('T1I')) {
            return null;
        }
        try {
            const binary = atob(text.trim());
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } catch {
            return null;
        }
    }

    /** Whether bytes are those of a track file, rather than of an original text format. */
    public static isBinary(bytes: Uint8Array): boolean {
        return bytes.length > 3 && bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1];
    }

    /** Inflates the body of a track file, refusing one larger than {@link MAX_BODY_SIZE}. */
    private static inflate(compressed: Uint8Array): Uint8Array {
        const chunks: Uint8Array[] = [];
        let size = 0;
        let done = false;
        const inflate = new Inflate((chunk, final) => {
            size += chunk.length;
            if (size > MAX_BODY_SIZE) {
                throw new Error('The track file is too large');
            }
            chunks.push(chunk);
            done ||= final;
        });
        try {
            inflate.push(compressed, true);
        } catch (e) {
            throw e instanceof Error && e.message === 'The track file is too large'
                ? e
                : new Error('The track file is corrupted');
        }
        if (!done) {
            throw new Error('The track file is truncated');
        }

        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.length;
        }
        return body;
    }

    /**
     * Merges the main layers together and the foreground layers together, in stack order, as a
     * track code holds them.
     */
    private static merge(layers: LayerDocument[]): LayerDocument[] {
        return (['main', 'foreground'] as const).map((type) => {
            const merged = emptyLayer(type, TRACK_CODE_LAYERS[type]);
            for (const layer of layers.filter((existing) => existing.type === type)) {
                // Not spread: a large track holds more entities than a call takes arguments
                layer.solid.forEach((polyline) => merged.solid.push(polyline));
                layer.items.forEach((item) => merged.items.push(item));
                for (const group of layer.scenery) {
                    addScenery(merged.scenery, group.color, group.polylines);
                }
            }
            return merged;
        });
    }

    private static writeLayer(writer: ByteWriter, layer: LayerDocument, editor: boolean): void {
        const main = layer.type === 'main';
        writer.byte((main ? 0 : FOREGROUND_FLAG) | (layer.visible ? 0 : HIDDEN_FLAG));
        if (editor) {
            writer.string(layer.name);
        }

        TrackFormat.writePolylines(writer, layer.solid);
        const scenery = layer.scenery.filter((group) => group.polylines.length);
        writer.uint(scenery.length);
        for (const group of scenery) {
            writer.uint(group.color);
            TrackFormat.writePolylines(writer, group.polylines);
        }
        if (main) {
            TrackFormat.writeItems(writer, layer.items);
        }
    }

    private static readLayer(reader: ByteReader, editor: boolean, index: number): LayerDocument {
        const flags = reader.byte();
        const type = flags & FOREGROUND_FLAG ? 'foreground' : 'main';
        const name = editor ? reader.string() || `Layer ${index + 1}` : TRACK_CODE_LAYERS[type];
        const layer = emptyLayer(type, name);
        layer.visible = (flags & HIDDEN_FLAG) === 0;

        layer.solid = TrackFormat.readPolylines(reader);
        const colorCount = reader.count();
        for (let i = 0; i < colorCount; i++) {
            addScenery(layer.scenery, reader.uint(), TrackFormat.readPolylines(reader));
        }
        if (type === 'main') {
            layer.items = TrackFormat.readItems(reader);
        }
        return layer;
    }

    private static writePolylines(writer: ByteWriter, polylines: Polyline[]): void {
        const valid = polylines.filter((polyline) => polyline.length >= 4);
        writer.uint(valid.length);
        let x = 0;
        let y = 0;
        for (const polyline of valid) {
            const count = polyline.length >> 1;
            writer.uint(count);
            for (let i = 0; i < count * 2; i += 2) {
                const px = Math.round(polyline[i]);
                const py = Math.round(polyline[i + 1]);
                writer.int(px - x);
                writer.int(py - y);
                x = px;
                y = py;
            }
        }
    }

    private static readPolylines(reader: ByteReader): Polyline[] {
        const count = reader.count();
        const polylines: Polyline[] = [];
        let x = 0;
        let y = 0;
        for (let i = 0; i < count; i++) {
            const pointCount = reader.count();
            const polyline: Polyline = new Array(pointCount * 2);
            for (let p = 0; p < pointCount * 2; p += 2) {
                x += reader.int();
                y += reader.int();
                polyline[p] = x;
                polyline[p + 1] = y;
            }
            polylines.push(polyline);
        }
        return polylines;
    }

    /** Writes the items in their order, which the physics depends on. */
    private static writeItems(writer: ByteWriter, items: ItemEntity[]): void {
        const valid = items.filter((item) => item.values.length >= 2);
        // Kinds of items, by letter and number of values: command blocks vary
        const kinds = new Map<string, number>();
        const indexes = valid.map((item) => {
            const key = `${item.code} ${item.values.length}`;
            let index = kinds.get(key);
            if (index === undefined) {
                index = kinds.size;
                kinds.set(key, index);
            }
            return index;
        });

        writer.uint(kinds.size);
        for (const key of kinds.keys()) {
            const [code, count] = key.split(' ');
            writer.string(code);
            writer.uint(Number(count));
        }

        writer.uint(valid.length);
        let x = 0;
        let y = 0;
        valid.forEach((item, i) => {
            writer.uint(indexes[i]);
            const [px, py, ...rest] = item.values.map(Math.round);
            writer.int(px - x);
            writer.int(py - y);
            x = px;
            y = py;
            rest.forEach((value) => writer.int(value));
        });
    }

    private static readItems(reader: ByteReader): ItemEntity[] {
        const kindCount = reader.count();
        const kinds: Array<{ code: string; count: number }> = [];
        for (let i = 0; i < kindCount; i++) {
            const code = reader.string();
            const count = reader.uint();
            if (count < 2) {
                throw new Error('The track file holds an invalid item');
            }
            kinds.push({ code, count });
        }

        const itemCount = reader.count();
        const items: ItemEntity[] = [];
        let x = 0;
        let y = 0;
        for (let i = 0; i < itemCount; i++) {
            const kind = kinds[reader.uint()];
            if (!kind) {
                throw new Error('The track file holds an invalid item');
            }
            x += reader.int();
            y += reader.int();
            const values = [x, y];
            for (let v = 2; v < kind.count; v++) {
                values.push(reader.int());
            }
            items.push({ code: kind.code, values });
        }
        return items;
    }
}
