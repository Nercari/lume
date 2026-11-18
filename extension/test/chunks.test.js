import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_BYTES, encodeBytes, joinChunks, splitBytes } from '../src/chunks.js';

test('chunks round-trip and a missing slice fails loud', () => {
  const bytes = new Uint8Array(CHUNK_BYTES + 10);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
  const parts = splitBytes(bytes);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].seq, 0);
  assert.equal(parts[1].total, 2);
  assert.deepEqual(joinChunks(parts), bytes);
  assert.deepEqual(joinChunks([parts[1], parts[0]]), bytes);
  assert.throws(() => joinChunks([parts[0]]), /blocos 1 de 2/);
  assert.deepEqual(joinChunks(splitBytes(new Uint8Array())), new Uint8Array());
  const encoded = parts.map((part) => ({ ...part, bytes: encodeBytes(part.bytes) }));
  assert.equal(typeof encoded[0].bytes, 'string');
  assert.deepEqual(joinChunks(encoded), bytes);
});
