/**
 * ZIP reading and writing for the marker — no libraries. Submission
 * packages are stored (uncompressed) archives built by the lab pages,
 * but students occasionally re-zip folders themselves, so deflated
 * entries are handled too via the platform DecompressionStream. All of
 * it operates on ArrayBuffers already in memory; nothing touches the
 * network.
 */

/** CRC-32 (IEEE), the polynomial ZIP uses. @param {Uint8Array} bytes */
export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Read a ZIP archive.
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {Promise<{ name: string, data: Uint8Array, crcOk: boolean }[]>}
 */
export async function readZip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // The end-of-central-directory record is within the final 64KB + 22
  // bytes (its comment is length-prefixed); scan backwards for its
  // signature.
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= floor; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054B50) { eocd = offset; break; }
  }
  if (eocd === -1) throw new Error('not a ZIP archive (no end-of-central-directory record)');

  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014B50) {
      throw new Error('corrupt ZIP: central directory entry expected');
    }
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue; // directory rows carry no data

    // The local header repeats name/extra with its own lengths.
    if (view.getUint32(localOffset, true) !== 0x04034B50) {
      throw new Error(`corrupt ZIP: bad local header for ${name}`);
    }
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localName + localExtra;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = await inflateRaw(compressed);
    } else {
      throw new Error(`unsupported compression method ${method} for ${name}`);
    }
    entries.push({ name, data, crcOk: crc32(data) === crc });
  }
  return entries;
}

/** @param {Uint8Array} compressed */
async function inflateRaw(compressed) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('this browser cannot decompress deflated ZIP entries');
  }
  const stream = new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Build a stored (uncompressed) ZIP — the same layout the lab pages
 * ship, used here for the feedback-file bundle.
 * @param {{ name: string, data: Uint8Array }[]} entries
 * @returns {Uint8Array}
 */
export function storeZip(entries) {
  const encoder = new TextEncoder();
  const normalized = entries.map((entry) => ({
    ...entry,
    nameBytes: encoder.encode(entry.name),
    crc: crc32(entry.data),
  }));
  const localSize = normalized.reduce(
    (total, entry) => total + 30 + entry.nameBytes.length + entry.data.length, 0);
  const centralSize = normalized.reduce(
    (total, entry) => total + 46 + entry.nameBytes.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let offset = 0;
  const write16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
  const write32 = (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; };

  for (const entry of normalized) {
    entry.localOffset = offset;
    write32(0x04034B50);
    write16(20); write16(0x0800); write16(0); write16(0); write16(0);
    write32(entry.crc); write32(entry.data.length); write32(entry.data.length);
    write16(entry.nameBytes.length); write16(0);
    output.set(entry.nameBytes, offset); offset += entry.nameBytes.length;
    output.set(entry.data, offset); offset += entry.data.length;
  }

  const centralOffset = offset;
  for (const entry of normalized) {
    write32(0x02014B50);
    write16(20); write16(20); write16(0x0800); write16(0); write16(0); write16(0);
    write32(entry.crc); write32(entry.data.length); write32(entry.data.length);
    write16(entry.nameBytes.length); write16(0); write16(0); write16(0); write16(0); write32(0);
    write32(entry.localOffset);
    output.set(entry.nameBytes, offset); offset += entry.nameBytes.length;
  }
  const centralEnd = offset;
  write32(0x06054B50);
  write16(0); write16(0); write16(normalized.length); write16(normalized.length);
  write32(centralEnd - centralOffset); write32(centralOffset); write16(0);
  return output;
}
