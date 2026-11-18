import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { mkdtemp, rm, copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSiwcFixture, startAuthIntercept, FIXTURE_EMAIL } from './fixtures/siwc-auth-server.mjs';

const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
const manifestPath = fileURLToPath(new URL('../manifest.json', import.meta.url));

function portClosed(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port, timeout: 400 });
    const finish = (closed) => {
      socket.destroy();
      resolve(closed);
    };
    socket.once('connect', () => finish(false));
    socket.once('error', () => finish(true));
    socket.once('timeout', () => finish(true));
  });
}

async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) {
    const source = join(from, name);
    const dest = join(to, name);
    if ((await stat(source)).isDirectory()) await copyTree(source, dest);
    else await copyFile(source, dest);
  }
}

test('the extension catches the loopback redirect and does not listen on it', { timeout: 120_000 }, async () => {
  const fixture = await createSiwcFixture();
  let callbackPort = 0;
  const intercept = await startAuthIntercept(fixture, {
    onRedirect: async (location) => {
      const redirect = new URL(location);
      assert.equal(redirect.protocol, 'http:');
      assert.equal(redirect.hostname, '127.0.0.1');
      assert.equal(redirect.pathname, '/auth/callback');
      callbackPort = Number(redirect.port);
      assert.equal(await portClosed(callbackPort), true);
    },
  });
  const extensionDir = await mkdtemp(join(tmpdir(), 'lume-siwc-ext-'));
  const userData = await mkdtemp(join(tmpdir(), 'lume-siwc-profile-'));
  let context;
  try {
    await copyTree(srcDir, extensionDir);
    await copyFile(manifestPath, join(extensionDir, 'manifest.json'));
    await writeFile(join(extensionDir, 'content.js'), '/* login e2e does not inject into a page */\n');
    const { chromium } = await import('playwright-core');
    context = await chromium.launchPersistentContext(userData, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--proxy-server=http://127.0.0.1:${intercept.port}`,
        '--host-resolver-rules=MAP challenges.cloudflare.com 127.0.0.1',
        '--ignore-certificate-errors',
      ],
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/panel.html`);
    await page.getByRole('button', { name: 'Entrar com ChatGPT' }).click();
    await page.getByText('Usando o plano ChatGPT').waitFor({ timeout: 15_000 });
    await page.getByText(`Conta: ${FIXTURE_EMAIL}`).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Gerenciar uso' }).getAttribute('href'), 'https://chatgpt.com/settings');
    assert.equal(callbackPort > 0, true);
    assert.equal(await portClosed(callbackPort), true);
    assert.equal(fixture.counts.token, 1);
    const custody = await page.evaluate(async () => {
      const local = await chrome.storage.local.get(null);
      const session = await chrome.storage.session.get(null);
      const token = session['lume.siwc.session']?.accessToken ?? '';
      return {
        leaked: token !== '' && JSON.stringify(local).includes(token),
        hasToken: token.startsWith('synthetic-access-token-'),
        keys: Object.keys(local).sort(),
      };
    });
    assert.equal(custody.leaked, false);
    assert.equal(custody.hasToken, true);
    assert.deepEqual(custody.keys, ['lume.siwc.clientId', 'lume.siwc.email', 'lume.siwc.hostId']);
    await page.getByRole('button', { name: 'Sair' }).click();
    await page.getByRole('button', { name: 'Entrar com ChatGPT' }).waitFor();
    assert.equal(fixture.counts.revoke >= 1, true);
    assert.equal(await portClosed(callbackPort), true);
  } finally {
    await context?.close();
    await intercept.close();
    await rm(extensionDir, { recursive: true, force: true });
    await rm(userData, { recursive: true, force: true });
  }
});
