/**
 * Minimal, deterministic ZIP archive writer.
 *
 * Produces the self-contained per-lab bundle an instructor uploads to the
 * LMS. Two properties matter more than compression here:
 *
 *   - Determinism: entries are stored uncompressed with a fixed timestamp
 *     and sorted paths, so the same rendered lab always produces a
 *     byte-identical bundle. (Bundles are mostly images, which do not
 *     recompress usefully anyway.)
 *   - Zero dependencies: the whole format lives in this one readable file.
 */
export class ZipWriter {
  /** DOS date/time fields for 1980-01-01 00:00:00 — the format's epoch. */
  static #DOS_TIME = 0;
  static #DOS_DATE = 0x21;

  constructor() {
    /** @type {{ path: string, data: Buffer }[]} */
    this.entries = [];
  }

  /**
   * @param {string} entryPath Forward-slash relative path inside the archive.
   * @param {Buffer | string} data
   */
  add(entryPath, data) {
    this.entries.push({
      path: entryPath,
      data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'),
    });
  }

  /** @returns {Buffer} The finished archive. */
  toBuffer() {
    const sorted = [...this.entries].sort((a, b) => (a.path < b.path ? -1 : 1));
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of sorted) {
      const nameBytes = Buffer.from(entry.path, 'utf8');
      const crc = ZipWriter.#crc32(entry.data);
      const local = ZipWriter.#localHeader(nameBytes, entry.data, crc);
      localParts.push(local, entry.data);
      centralParts.push(ZipWriter.#centralHeader(nameBytes, entry.data, crc, offset));
      offset += local.length + entry.data.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(sorted.length, 8);
    end.writeUInt16LE(sorted.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...localParts, centralDirectory, end]);
  }

  /**
   * @param {Buffer} nameBytes
   * @param {Buffer} data
   * @param {number} crc
   * @returns {Buffer}
   */
  static #localHeader(nameBytes, data, crc) {
    const header = Buffer.alloc(30 + nameBytes.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);                    // version needed
    header.writeUInt16LE(ZipWriter.#DOS_TIME, 10);
    header.writeUInt16LE(ZipWriter.#DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);          // compressed (stored)
    header.writeUInt32LE(data.length, 22);          // uncompressed
    header.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(header, 30);
    return header;
  }

  /**
   * @param {Buffer} nameBytes
   * @param {Buffer} data
   * @param {number} crc
   * @param {number} offset
   * @returns {Buffer}
   */
  static #centralHeader(nameBytes, data, crc, offset) {
    const header = Buffer.alloc(46 + nameBytes.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);                    // version made by
    header.writeUInt16LE(20, 6);                    // version needed
    header.writeUInt16LE(ZipWriter.#DOS_TIME, 12);
    header.writeUInt16LE(ZipWriter.#DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    nameBytes.copy(header, 46);
    return header;
  }

  /**
   * @param {Buffer} data
   * @returns {number}
   */
  static #crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
}
