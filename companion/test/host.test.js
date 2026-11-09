import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createHost, runStdio } from '../src/host.js';
import { originFor, COMMANDS } from '../src/commands.js';
import { encodeMessage, FrameDecoder } from '../src/framing.js';

const EXT = 'abcdefghijklmnopabcdefghijklmnop'; // synthetic extension ID
const ORIGIN = originFor(EXT);
const silent = { info() {}, warn() {}, error() {} };
const host = createHost({ allowedOrigin: ORIGIN, logger: silent, handlers: { status: async () => ({ signedIn: false }) } });

test('accepts a valid command from the allowed origin', async () => {
  assert.deepEqual(await host(ORIGIN, { id: 'a1', cmd: 'status', args: {} }), { id: 'a1', ok: true, result: { signedIn: false } });
});

test('rejects other origins, including look-alikes', async () => {
  for (const o of [undefined, '', 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba/', `${ORIGIN}x`, 'https://example.org/']) {
    const r = await host(o, { id: 'a1', cmd: 'status', args: {} });
    assert.equal(r.error.code, 'bad_origin', String(o));
  }
});

test('rejects unknown commands and anything resembling a general local API', async () => {
  for (const cmd of ['fetch', 'exec', 'readFile', 'proxy', '__proto__', 'constructor', 'toString']) {
    assert.equal((await host(ORIGIN, { id: 'a1', cmd, args: {} })).error.code, 'unknown_command', cmd);
  }
});

test('rejects malformed requests strictly', async () => {
  const cases = [
    [null, 'bad_request'],
    [[], 'bad_request'],
    [{ id: 'a1', cmd: 'status', args: {}, extra: 1 }, 'bad_request'],
    [{ id: 'has space', cmd: 'status' }, 'bad_request'],
    [{ id: 'a'.repeat(65), cmd: 'status' }, 'bad_request'],
    [{ id: 'a1', cmd: 'status', args: [] }, 'bad_request'],
    [{ id: 'a1', cmd: 'status', args: { url: 'http://x' } }, 'bad_args'],
  ];
  for (const [msg, code] of cases) assert.equal((await host(ORIGIN, msg)).error.code, code, JSON.stringify(msg));
});

test('command set is fixed to status, login.start, logout', () => {
  assert.deepEqual(Object.keys(COMMANDS).sort(), ['login.start', 'logout', 'status']);
  assert.throws(() => originFor('not-an-id'), { code: 'bad_config' });
});

test('stdio loop answers framed requests and stops on an oversize frame', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  runStdio({ handle: host, origin: ORIGIN, input, output, logger: silent });
  const dec = new FrameDecoder(1024 * 1024);
  const replies = [];
  output.on('data', (c) => replies.push(...dec.push(c)));
  input.write(encodeMessage({ id: 's1', cmd: 'status', args: {} }));
  const big = Buffer.alloc(4);
  big.writeUInt32LE(10 * 1024 * 1024);
  input.write(big);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(replies[0].ok, true);
  assert.equal(replies[1].error.code, 'message_too_large');
  assert.equal(input.destroyed, true);
  process.exitCode = 0;
});
