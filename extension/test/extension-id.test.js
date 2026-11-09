import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyJB4I0tYGpyoZy4uALDPV1DEsaRUQ4p8x57EJtKrvZC6GMIDyGBQC4FSdYZueFCrZm1W7miXDFjdE56QffHoZ9S67IxNrWvt6NIZcVCIthKhYNmzqckR6vY7qrJHYosJ8dBfcEfYhJdM9oHZjSL0Y+F886bLG1PIjJcOFSM5uSHdslsQcBT6AuvLo8+NnDzpYq1/7UO2Io/OgFVQDxwL9nS+Fle9SVd8WASRgkeqnMQeW8Tk/o/5Y0C9/7gu7GD6/UBU1dOwZPZ6/TOwjv0E0uu9H9OtySljqz0kasa/RrDWYUkJFZnQoyTV9sqC0nCTf1D13jFOmd2k+cM9ecU69QIDAQAB';

function extensionIdFromKey(key) {
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16).toString('hex');
  return [...hex].map((c) => String.fromCharCode(c.charCodeAt(0) + (c >= 'a' ? 10 : 49))).join('');
}

test('the manifest key pins the extension id used for native messaging', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.key, KEY);
  assert.equal(extensionIdFromKey(manifest.key), 'odjfiioakpihgkikmjadmohgckkhkjhi');
});
