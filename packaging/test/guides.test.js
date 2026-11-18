import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '../docs');
const guiasDir = join(dirname(fileURLToPath(import.meta.url)), '../guias');

const GUIDE_FILES = ['user-guide.md', 'permissions-and-limits.md', 'package-layout.md', 'observer-checklist.md'];
const STAFF_GUIDE_PATHS = [...GUIDE_FILES.map((f) => join(docsDir, f)), join(guiasDir, 'LEIA-ME-PRIMEIRO.md')];
const START_GUIDES = [
  join(guiasDir, 'COMECE-AQUI.txt'),
  join(guiasDir, 'LEIA-ME-PRIMEIRO.md'),
];
const PREVIOUS_START = [join(docsDir, 'user-guide.md')];

const PLANO_B =
  'Plano B: sem entrar ou sem cota, use a aba do caso no painel lateral do ChatGPT com o plugin Lume JEF.';
const PREVIOUS_PLANO_B =
  'Plano B: clique você no botão Lume: Estudar processo na página do processo. A aba e os próximos passos são os mesmos.';
const PROJECT_FALLBACK =
  'Sem o app desktop: use a pasta plugin\\lume-jef-projeto num Projeto (instruções em COLE-NO-PROJETO.md).';
const CALIBRATION =
  'Se o painel não achar a lista, use Calibrar PJe, salve lume-calibracao.json e envie o arquivo ao mantenedor.';
const PRIVACY = 'Nada além do ChatGPT sai do computador.';

const PASTE_TOKEN = /paste\s+(your\s+)?(token|api\s*key|refresh)/i;
const PASTE_TOKEN_PT = /\b(cole|colar|insira|digite)\b[^.\n]{0,40}\b(token|tokens|chave|senha)\b/i;
const FORBIDDEN = [
  /\bOPENAI_API_KEY\b/,
  /\bsk-[A-Za-z0-9]{8,}/,
  /billing\s+fallback/i,
  /x-api-key/i,
];

const PAID_CREDITS = /paid\s+api\s+credits?/i;
const ENABLE_PAID = /enable\s+paid/i;
const PAID_PT = /cr[eé]dito\s+pago|habilit(e|ar)\s+.{0,20}pago/i;

const BYOK = /bring\s+your\s+own\s+api\s+key/i;
const BYOK_PT = /\b(chave de api|api\s*key)\b/i;

function lineInstructsForbidden(line, re) {
  if (!re.test(line)) return false;
  return !/(never|do not|does not|must not|without|no alternate|not offer|not silently|does \*\*not\*\*|n[aã]o\s+(cole|use|habilite|ative|existe)|nunca\s+cole)/i.test(
    line,
  );
}

const REQUIRED_SAFE = [/does \*\*not\*\* offer a paid API key/i, /never paste tokens/i];

test('staff-facing guides forbid token paste and paid fallback instructions', () => {
  for (const path of STAFF_GUIDE_PATHS) {
    const file = path.endsWith('LEIA-ME-PRIMEIRO.md') ? 'LEIA-ME-PRIMEIRO.md' : path.split('/').pop();
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      assert.ok(!lineInstructsForbidden(line, PASTE_TOKEN), `${file} instructs token paste: ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, PASTE_TOKEN_PT), `${file} instructs token paste (pt): ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, BYOK), `${file} instructs BYOK: ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, BYOK_PT), `${file} instructs BYOK (pt): ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, PAID_CREDITS), `${file} instructs paid credits: ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, PAID_PT), `${file} instructs paid path (pt): ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, ENABLE_PAID), `${file} enables paid path: ${line.trim()}`);
    }
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `${file} must not match ${re}`);
    }
  }
  const user = readFileSync(join(docsDir, 'user-guide.md'), 'utf8');
  for (const re of REQUIRED_SAFE) {
    assert.ok(re.test(user), `user-guide.md should state safety: ${re}`);
  }
});

test('start guides use exactly three Portuguese steps: install, sign in, then gerar', () => {
  for (const path of START_GUIDES) {
    const text = readFileSync(path, 'utf8');
    const file = path.split('/').pop();
    const numbered = text.split('\n').filter((line) => /^\d+\.\s/.test(line));
    assert.equal(numbered.length, 3, `${file} numbered steps: ${numbered.join(' | ')}`);
    assert.match(numbered[0], /^1\. Instale a extensão:/);
    assert.match(numbered[0], /chrome:\/\/extensions > Modo do desenvolvedor > Carregar sem compactação/);
    assert.match(numbered[0], /opcional/i);
    assert.match(numbered[0], /plugin\\lume-jef\\instalar\\instalar-plugin\.cmd/);
    assert.match(numbered[0], /reinicie o app ChatGPT e instale "Lume JEF" em Plugins > Lume/);
    assert.match(numbered[1], /^2\. No painel do Lume, clique "Entrar com ChatGPT" uma vez e aprove\./);
    assert.match(numbered[2], /^3\. No processo do PJe, clique "Lume: Estudar processo" e depois "Gerar relatório e minuta"\./);
    assert.ok(text.includes(PLANO_B), `${file} missing Plano B`);
    assert.ok(text.includes(PROJECT_FALLBACK), `${file} missing project fallback`);
    assert.ok(text.includes(CALIBRATION), `${file} missing calibration line`);
    assert.ok(text.includes(PRIVACY), `${file} missing privacy line`);
    assert.equal(text.includes('PROJETO-LUME.md'), false, `${file} still tells staff to use PROJETO-LUME.md`);
  }
});

test('the staff user guide keeps its previous three steps', () => {
  for (const path of PREVIOUS_START) {
    const text = readFileSync(path, 'utf8');
    const file = path.split('/').pop();
    const numbered = text.split('\n').filter((line) => /^\d+\.\s/.test(line));
    assert.equal(numbered.length, 3, `${file} numbered steps: ${numbered.join(' | ')}`);
    assert.match(numbered[0], /^1\. Instale:/);
    assert.match(numbered[1], /^2\. No PJe, abra o processo e clique "Lume: Estudar processo"/);
    assert.match(numbered[2], /^3\. No ChatGPT \(painel lateral nessa aba, chat normal\), peça o relatório ou a minuta/);
    assert.ok(text.includes(PREVIOUS_PLANO_B), `${file} missing Plano B`);
    assert.ok(text.includes(PROJECT_FALLBACK), `${file} missing project fallback`);
    assert.ok(text.includes(CALIBRATION), `${file} missing calibration line`);
    assert.ok(text.includes(PRIVACY), `${file} missing privacy line`);
  }
});

test('all packaging docs exist and are non-empty', () => {
  const names = readdirSync(docsDir).filter((f) => f.endsWith('.md'));
  assert.ok(names.length >= 7, names.join(', '));
  for (const n of names) {
    const body = readFileSync(join(docsDir, n), 'utf8').trim();
    assert.ok(body.length > 200, `${n} too short`);
  }
});
