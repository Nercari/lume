import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_ORIGIN,
  HOST_NAME,
  buildHostManifest,
  escapeWindowsPathForJson,
} from '../scripts/native-manifest.mjs';

const packaging = join(dirname(fileURLToPath(import.meta.url)), '..');
const readPs1 = (name) => readFileSync(join(packaging, 'windows', name), 'utf8');

test('native messaging manifest shape and Windows path escaping', () => {
  const winPath = 'C:\\Users\\juiz\\AppData\\Local\\Lume\\windows\\lume-host.bat';
  const manifest = buildHostManifest({ hostPath: winPath });
  assert.equal(manifest.name, HOST_NAME);
  assert.equal(manifest.type, 'stdio');
  assert.deepEqual(manifest.allowed_origins, [ALLOWED_ORIGIN]);

  const json = JSON.stringify(manifest);
  const parsed = JSON.parse(json);
  assert.equal(parsed.path, winPath);
  assert.ok(json.includes('\\\\'), 'JSON must escape backslashes in path');
});

test('Windows install scripts stay user-level (HKCU) and offline', () => {
  for (const file of ['instalar.ps1', 'desinstalar.ps1']) {
    const text = readPs1(file);
    assert.ok(!/\bHKLM\b/i.test(text), `${file} must not touch HKLM`);
    assert.ok(!/RunAsAdministrator/i.test(text), `${file} must not elevate`);
    assert.ok(!/Invoke-WebRequest|DownloadString|Start-BitsTransfer/i.test(text), `${file} must not download`);
    assert.match(text, /HKCU:/i, `${file} should register under HKCU`);
  }
  const instalarBat = readFileSync(join(packaging, 'windows', 'instalar.bat'), 'utf8');
  assert.match(instalarBat, /ExecutionPolicy Bypass/i);
  const instalar = readPs1('instalar.ps1');
  assert.match(instalar, /com\.lume\.chatgpt/);
  assert.match(instalar, /odjfiioakpihgkikmjadmohgckkhkjhi/);
});

test('shell installers reference fixed extension id and host name', () => {
  for (const rel of ['macos/instalar.sh', 'linux/instalar.sh']) {
    const text = readFileSync(join(packaging, rel), 'utf8');
    assert.match(text, /odjfiioakpihgkikmjadmohgckkhkjhi/);
    assert.match(text, /com\.lume\.chatgpt/);
    assert.ok(!/curl\s+http/i.test(text));
  }
});

test('IT sample policies name Chrome Enterprise keys', () => {
  const json = readFileSync(join(packaging, 'it/sample-policies.json'), 'utf8');
  for (const key of [
    'ExtensionInstallForcelist',
    'ExtensionSettings',
    'ExtensionInstallAllowlist',
    'NativeMessagingUserLevelHosts',
    'NativeMessagingAllowlist',
  ]) {
    assert.ok(json.includes(`"${key}"`), key);
  }
});
