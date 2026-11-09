import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachToComposer, CHATGPT_SELECTORS, composerTargets, studyPrompt } from '../src/chatgpt.js';
import { projectUrlOrDefault } from '../src/settings.js';
import { doc, el } from './dom.js';

test('named composer selectors match the synthetic fixture', () => {
  const html = readFileSync(new URL('./fixtures/chatgpt-composer.html', import.meta.url), 'utf8');
  assert.match(html, /data-lume-composer/);
  assert.match(html, /type="file"/);
  assert.match(html, /<textarea/);
  assert.match(html, /data-lume-send/);
  for (const selector of Object.values(CHATGPT_SELECTORS)) assert.equal(typeof selector, 'string');
  const tree = doc(el('div', { 'data-lume-composer': '' },
    el('textarea', {}, ''),
    el('input', { type: 'file' }),
    el('button', { 'data-lume-send': '', type: 'button' }, 'Enviar')));
  const targets = composerTargets(tree);
  assert.ok(targets.file);
  assert.ok(targets.prompt);
  assert.ok(targets.send);
  assert.equal(composerTargets(doc(el('div', {}, 'vazio'))), null);
});

test('attach fills the file input and the prompt and does not send', () => {
  const prompt = { value: '', events: [], dispatchEvent(event) { this.events.push(event.type); } };
  const file = { files: null, events: [], dispatchEvent(event) { this.events.push(event.type); } };
  const send = { clicked: 0 };
  const root = {
    querySelector(selector) {
      if (selector === CHATGPT_SELECTORS.file) return file;
      if (selector === CHATGPT_SELECTORS.prompt) return prompt;
      if (selector === CHATGPT_SELECTORS.send) return send;
      return null;
    },
  };
  const page = { querySelector: (selector) => (selector === CHATGPT_SELECTORS.root ? root : null) };
  const stored = [];
  const result = attachToComposer(page, [
    { name: 'lume-caso-parte-01-de-02.md', text: 'parte um' },
    { name: 'lume-caso-parte-02-de-02.md', text: 'parte dois' },
  ], () => ({
    items: { add(entry) { stored.push(entry); } },
    get files() { return stored; },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.sent, false);
  assert.equal(result.files, 2);
  assert.equal(send.clicked, 0);
  assert.equal(file.files.length, 2);
  assert.equal(file.files[0].name, 'lume-caso-parte-01-de-02.md');
  assert.equal(prompt.value, studyPrompt(2));
  assert.equal(prompt.value, 'Estudo integral: leia todas as 2 partes anexadas antes de qualquer minuta.');
  assert.ok(file.events.includes('change'));
});

test('the project URL stays on chatgpt.com', () => {
  assert.equal(projectUrlOrDefault('').url, 'https://chatgpt.com/');
  assert.equal(projectUrlOrDefault('https://chatgpt.com/g/proj').ok, true);
  assert.equal(projectUrlOrDefault('https://example.com/').ok, false);
  assert.equal(projectUrlOrDefault('http://chatgpt.com/').ok, false);
});
