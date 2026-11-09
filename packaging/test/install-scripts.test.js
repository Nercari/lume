import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const packaging = join(dirname(fileURLToPath(import.meta.url)), '..');
const readPs1 = (name) => readFileSync(join(packaging, 'windows', name), 'utf8');

test('Windows install scripts stay user-level (HKCU) and offline', () => {
  for (const file of ['instalar.ps1', 'desinstalar.ps1']) {
    const text = readPs1(file);
    assert.ok(!/\bHKLM\b/i.test(text), `${file} must not touch HKLM`);
    assert.ok(!/RunAsAdministrator/i.test(text), `${file} must not elevate`);
    assert.ok(!/Invoke-WebRequest|DownloadString|Start-BitsTransfer/i.test(text), `${file} must not download`);
  }
  const instalarBat = readFileSync(join(packaging, 'windows', 'instalar.bat'), 'utf8');
  assert.match(instalarBat, /ExecutionPolicy Bypass/i);
  const instalar = readPs1('instalar.ps1');
  assert.match(instalar, /odjfiioakpihgkikmjadmohgckkhkjhi/);
  assert.match(instalar, /PROJETO-LUME/);
  const nm = 'Native' + 'Messaging';
  assert.ok(!instalar.includes(nm), 'installer must not register a native host');
  const desinstalar = readPs1('desinstalar.ps1');
  assert.ok(!desinstalar.includes(nm));
});

test('shell installers reference fixed extension id and ChatGPT guide', () => {
  for (const rel of ['macos/instalar.sh', 'linux/instalar.sh']) {
    const text = readFileSync(join(packaging, rel), 'utf8');
    assert.match(text, /odjfiioakpihgkikmjadmohgckkhkjhi/);
    assert.match(text, /LEIA-ME/);
    assert.ok(!/com\.lume\.chatgpt/.test(text));
    assert.ok(!/curl\s+http/i.test(text));
  }
});

test('IT sample policies name Chrome Enterprise keys', () => {
  const json = readFileSync(join(packaging, 'it/sample-policies.json'), 'utf8');
  for (const key of [
    'ExtensionInstallForcelist',
    'ExtensionSettings',
    'ExtensionInstallAllowlist',
  ]) {
    assert.ok(json.includes(`"${key}"`), key);
  }
  const policies = JSON.parse(json);
  assert.ok(Array.isArray(policies.ExtensionInstallForcelist));
  assert.match(policies.ExtensionInstallForcelist[0], /;/);
});
