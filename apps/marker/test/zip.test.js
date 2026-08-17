import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { test } from 'node:test';

import { crc32, readZip, storeZip } from '../public/js/zip.js';

const text = (value) => new TextEncoder().encode(value);

test('storeZip → readZip round-trips names, bytes, and checksums', async () => {
  const entries = [
    { name: 'completion.json', data: text('{"schema_version":"sept-ilp-completion-v1"}') },
    { name: 'evidence/lab1_vi_file-trace.png', data: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0, 1, 2, 3]) },
  ];
  const archive = storeZip(entries);
  const read = await readZip(archive);
  assert.equal(read.length, 2);
  assert.deepEqual(read.map((entry) => entry.name), entries.map((entry) => entry.name));
  assert.deepEqual([...read[1].data], [...entries[1].data]);
  assert.ok(read.every((entry) => entry.crcOk));
});

test('the archive layout matches the lab page’s submission ZIPs exactly', async () => {
  // The lab page writes stored entries with UTF-8 names and an EOCD
  // whose central-directory size excludes the end record itself (the
  // original prototype overstated it by 12 bytes; both writers here
  // are the fixed layout). Verify the interesting byte offsets.
  const archive = storeZip([{ name: 'a.txt', data: text('hello') }]);
  const view = new DataView(archive.buffer);
  assert.equal(view.getUint32(0, true), 0x04034B50, 'local header signature');
  assert.equal(view.getUint16(8, true), 0, 'stored, not compressed');
  const eocd = archive.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054B50, 'EOCD signature');
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  assert.equal(centralOffset + centralSize, eocd,
    'central directory runs exactly up to the EOCD record');
});

test('deflated entries inflate through DecompressionStream', async () => {
  // Hand-build a ZIP with one deflated entry, as re-zipping tools make.
  const payload = text('deflated payload — students re-zip folders sometimes');
  const compressed = new Uint8Array(zlib.deflateRawSync(payload));
  const name = text('completion.json');
  const out = new Uint8Array(30 + name.length + compressed.length + 46 + name.length + 22);
  const view = new DataView(out.buffer);
  let offset = 0;
  const w16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
  const w32 = (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; };
  w32(0x04034B50); w16(20); w16(0); w16(8); w16(0); w16(0);
  w32(crc32(payload)); w32(compressed.length); w32(payload.length);
  w16(name.length); w16(0);
  out.set(name, offset); offset += name.length;
  out.set(compressed, offset); offset += compressed.length;
  const centralOffset = offset;
  w32(0x02014B50); w16(20); w16(20); w16(0); w16(8); w16(0); w16(0);
  w32(crc32(payload)); w32(compressed.length); w32(payload.length);
  w16(name.length); w16(0); w16(0); w16(0); w16(0); w32(0); w32(0);
  out.set(name, offset); offset += name.length;
  const centralEnd = offset;
  w32(0x06054B50); w16(0); w16(0); w16(1); w16(1);
  w32(centralEnd - centralOffset); w32(centralOffset); w16(0);

  const read = await readZip(out);
  assert.equal(read.length, 1);
  assert.equal(new TextDecoder().decode(read[0].data), new TextDecoder().decode(payload));
  assert.ok(read[0].crcOk);
});

test('corruption is reported, not silently accepted', async () => {
  await assert.rejects(() => readZip(text('this is not a zip file at all')), /not a ZIP/);

  // Flip a payload byte: the entry reads but its checksum fails.
  const archive = storeZip([{ name: 'a.txt', data: text('hello world') }]);
  archive[30 + 'a.txt'.length] ^= 0xFF;
  const read = await readZip(archive);
  assert.equal(read[0].crcOk, false);
});

test('directory entries are skipped, files inside them are kept', async () => {
  // storeZip never writes directory rows, but student-made ZIPs have
  // them: emulate by storing a zero-length "evidence/" entry.
  const archive = storeZip([
    { name: 'evidence/', data: new Uint8Array(0) },
    { name: 'evidence/trace.png', data: new Uint8Array([1, 2, 3]) },
  ]);
  const read = await readZip(archive);
  assert.deepEqual(read.map((entry) => entry.name), ['evidence/trace.png']);
});
