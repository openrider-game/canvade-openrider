/**
 * Writes the binary track files: bytes, variable length integers and strings, in a buffer that
 * grows as needed.
 *
 * Integers are written as varints, 7 bits per byte, the high bit telling whether more bytes
 * follow; signed integers are zigzag encoded first, so that small negative numbers stay small.
 * Both handle every safe integer, not only 32 bits ones.
 */
export class ByteWriter {
    private buffer = new Uint8Array(1024);
    private length = 0;

    /** Bytes written so far. */
    public get bytes(): Uint8Array {
        return this.buffer.subarray(0, this.length);
    }

    public byte(value: number): void {
        this.reserve(1);
        this.buffer[this.length++] = value;
    }

    public raw(bytes: Uint8Array): void {
        this.reserve(bytes.length);
        this.buffer.set(bytes, this.length);
        this.length += bytes.length;
    }

    /** Writes a positive integer. */
    public uint(value: number): void {
        this.reserve(8);
        while (value >= 0x80) {
            this.buffer[this.length++] = (value % 0x80) | 0x80;
            value = Math.floor(value / 0x80);
        }
        this.buffer[this.length++] = value;
    }

    /** Writes an integer, positive or negative. */
    public int(value: number): void {
        this.uint(value >= 0 ? value * 2 : -value * 2 - 1);
    }

    /** Writes a string as its UTF-8 length, then its UTF-8 bytes. */
    public string(value: string): void {
        const bytes = new TextEncoder().encode(value);
        this.uint(bytes.length);
        this.raw(bytes);
    }

    private reserve(count: number): void {
        if (this.length + count <= this.buffer.length) {
            return;
        }
        const grown = new Uint8Array(Math.max(this.buffer.length * 2, this.length + count));
        grown.set(this.bytes);
        this.buffer = grown;
    }
}

/**
 * Reads what a {@link ByteWriter} wrote.
 *
 * @throws On every read past the end of the bytes, the file being truncated or invalid.
 */
export class ByteReader {
    private offset = 0;

    public constructor(private readonly bytes: Uint8Array) {}

    /** Number of bytes left to read. */
    public get remaining(): number {
        return this.bytes.length - this.offset;
    }

    public byte(): number {
        if (this.offset >= this.bytes.length) {
            throw new Error('The track file is truncated');
        }
        return this.bytes[this.offset++];
    }

    /** The bytes left to read. */
    public rest(): Uint8Array {
        const rest = this.bytes.subarray(this.offset);
        this.offset = this.bytes.length;
        return rest;
    }

    public uint(): number {
        let value = 0;
        let factor = 1;
        for (;;) {
            const byte = this.byte();
            value += (byte & 0x7f) * factor;
            if (byte < 0x80) {
                return value;
            }
            factor *= 0x80;
            if (factor > Number.MAX_SAFE_INTEGER) {
                throw new Error('The track file holds an invalid number');
            }
        }
    }

    public int(): number {
        const value = this.uint();
        return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
    }

    /**
     * Reads a count of entries, each taking at least a byte: a count larger than the bytes left
     * can only come from an invalid file, refused before allocating anything for it.
     */
    public count(): number {
        const count = this.uint();
        if (count > this.remaining) {
            throw new Error('The track file is truncated');
        }
        return count;
    }

    public string(): string {
        const length = this.count();
        const bytes = this.bytes.subarray(this.offset, this.offset + length);
        this.offset += length;
        return new TextDecoder().decode(bytes);
    }
}
