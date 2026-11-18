// Scores one synthetic capture against the case pack that goes to ChatGPT.
// No browser and no DOM: unit-tested in extension/test/eval-score.test.js.
// Capture and state come from the pack sidecar; OCR text comes from the pack
// passages. Neither the timing report (#measure) nor the bench report carries text.

import { errorRates } from '../../extraction/src/measure.js';

const TAG = /^\[ID ([^,\]]+)(?:,[^\]]*)?\]$/;

// Pack passages start with "[ID D01]" or "[ID D05, pág. PDF 2]".
export function passagesFromPack(text) {
  const blocks = new Map();
  let id = null;
  for (const line of String(text ?? '').split('\n')) {
    const tag = TAG.exec(line.trim());
    if (tag) {
      id = tag[1].trim();
      if (!blocks.has(id)) blocks.set(id, []);
      continue;
    }
    if (id) blocks.get(id).push(line);
  }
  return new Map([...blocks].map(([key, lines]) => [key, lines.join('\n').trim()]));
}

// The pack says "lido", "restrito", "ilegível" in the index row and names the
// gap reason in the Lacunas block. A corrupt file has no readable page and a
// "binario" gap.
export function stateFromPack(id, sidecar) {
  const gap = (sidecar?.gaps ?? []).find((row) => String(row?.id) === String(id));
  if (gap && gap.reason === 'binario') return 'corrupt';
  const row = (sidecar?.documents ?? []).find((item) => String(item?.id) === String(id));
  if (!row) return 'missing';
  if (row.situacao === 'lido') return 'readable';
  if (row.situacao === 'restrito') return 'restricted';
  return String(row.situacao);
}

export function scoreCase(expectation, artifact) {
  const blocks = passagesFromPack(artifact?.text);
  const sidecar = artifact?.sidecar ?? null;
  const present = new Set((sidecar?.documents ?? []).map((row) => String(row?.id)));
  const docs = expectation?.documents ?? [];
  const mismatches = [];
  const ocr = { pages: 0, chars: 0, charTotal: 0, words: 0, wordTotal: 0 };
  let captured = 0;
  let matches = 0;
  for (const doc of docs) {
    if (!present.has(doc.id)) {
      mismatches.push({ id: doc.id, expected: doc.state, actual: 'missing' });
      continue;
    }
    captured += 1;
    const actual = stateFromPack(doc.id, sidecar);
    if (actual === doc.state) matches += 1;
    else mismatches.push({ id: doc.id, expected: doc.state, actual });
    if (doc.ocrText) {
      const rates = errorRates(doc.ocrText, blocks.get(doc.id) ?? '');
      ocr.pages += doc.ocrPages ?? 1;
      ocr.chars += rates.chars;
      ocr.charTotal += rates.charTotal;
      ocr.words += rates.words;
      ocr.wordTotal += rates.wordTotal;
    }
  }
  const expected = new Set(docs.map((doc) => doc.id));
  for (const row of sidecar?.documents ?? []) {
    if (expected.has(String(row.id))) continue;
    mismatches.push({ id: String(row.id), expected: '—', actual: stateFromPack(row.id, sidecar) });
  }
  const sigilo = docs.filter((doc) => doc.sigilo);
  const sigiloShown = sigilo.length === 0 || Boolean(
    artifact?.sigilo && artifact.sigilo.hidden === false && String(artifact.sigilo.text ?? '').trim(),
  );
  if (!sigiloShown) for (const doc of sigilo) mismatches.push({ id: doc.id, expected: 'sigilo-warning', actual: 'none' });
  return {
    id: expectation?.id ?? '',
    documentsExpected: docs.length,
    documentsCaptured: captured,
    stateExpected: docs.length,
    stateMatches: matches,
    mismatches,
    sigiloExpected: sigilo.length,
    sigiloWarningShown: sigiloShown,
    ocr,
  };
}

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

// perRun is one array of case scores per run. Counts, states and OCR come from
// the first run; a mismatch seen in any run is reported once; totalSec is the
// median over every case run.
export function combineScores(perRun, { runs, latencyMs, fixtureVersion, seconds }) {
  const first = perRun[0] ?? [];
  const ocr = { pages: 0, chars: 0, charTotal: 0, words: 0, wordTotal: 0 };
  for (const score of first) {
    for (const key of Object.keys(ocr)) ocr[key] += score.ocr[key];
  }
  const mismatches = [];
  const seen = new Set();
  for (const score of perRun.flat()) {
    for (const miss of score.mismatches) {
      const key = `${miss.id}:${miss.expected}:${miss.actual}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mismatches.push(miss);
    }
  }
  const expected = sum(first, 'documentsExpected');
  const captured = sum(first, 'documentsCaptured');
  return {
    fixtureVersion,
    cases: first.length,
    runs,
    latencyMs: Math.round(latencyMs),
    documentsExpected: expected,
    documentsCaptured: captured,
    captureRate: expected ? Number((captured / expected).toFixed(4)) : 0,
    stateMatches: sum(first, 'stateMatches'),
    stateExpected: sum(first, 'stateExpected'),
    stateMismatches: mismatches,
    sigiloWarningShown: perRun.flat().every((score) => score.sigiloWarningShown),
    ocr: {
      pages: ocr.pages,
      cer: Number((ocr.chars / Math.max(1, ocr.charTotal)).toFixed(4)),
      wer: Number((ocr.words / Math.max(1, ocr.wordTotal)).toFixed(4)),
    },
    totalSec: median(seconds),
  };
}

export function median(values) {
  const nums = (values ?? []).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  const value = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  return Number(value.toFixed(2));
}
