// Synthetic private-manifest-shaped set. Opaque ids and placeholder sentences only.
// This is not a legal case and it is not an acceptance result.

const otherIds = Array.from({ length: 20 }, (_, i) => ({ id: `O${i + 1}` }));

const fact = (doc) => ({
  id: 'F1',
  statement: 'Synthetic decisive fact',
  sources: [{ doc, page: 1 }],
});

const gap = () => ({ id: 'G1', description: 'Synthetic gap' });

function caseOf({ id, split, pageCount, slices, inventory, contradictions = [] }) {
  return {
    id,
    split,
    page_count: pageCount,
    slices,
    annotation: {
      reviewer: 'rev-synth01',
      completed_before_evaluation: true,
      decisive_facts: [fact(inventory[0].doc)],
      contradictions,
      gaps: [gap()],
      inventory,
    },
  };
}

const manifest = {
  manifest_version: 1,
  cases: [
    caseOf({
      id: 'case-synth01',
      split: 'tuning',
      pageCount: 1000,
      slices: ['long-record', 'scans'],
      inventory: [
        { doc: 'doc-001', pages: 900, kind: 'text', readable: true },
        { doc: 'doc-002', pages: 100, kind: 'scan', readable: true },
      ],
    }),
    caseOf({
      id: 'case-synth02',
      split: 'tuning',
      pageCount: 40,
      slices: ['attachments', 'contradictions'],
      inventory: [
        { doc: 'doc-001', pages: 30, kind: 'text', readable: true },
        { doc: 'doc-002', pages: 10, kind: 'attachment', readable: true },
      ],
      contradictions: [{
        id: 'C1',
        description: 'Synthetic contradiction',
        sources: [{ doc: 'doc-001', page: 3 }, { doc: 'doc-002', page: 2 }],
      }],
    }),
    caseOf({
      id: 'case-synth03',
      split: 'held-out',
      pageCount: 25,
      slices: ['inventory-change'],
      inventory: [
        { doc: 'doc-001', pages: 20, kind: 'text', readable: true },
        { doc: 'doc-002', pages: 5, kind: 'text', readable: true, added_late: true },
      ],
    }),
    caseOf({
      id: 'case-synth04',
      split: 'held-out',
      pageCount: 12,
      slices: ['unreadable-restricted'],
      inventory: [
        { doc: 'doc-001', pages: 10, kind: 'text', readable: true },
        { doc: 'doc-002', pages: 2, kind: 'scan', readable: false, restricted: true },
      ],
    }),
    caseOf({
      id: 'case-synth05',
      split: 'held-out',
      pageCount: 8,
      slices: ['scans'],
      inventory: [{ doc: 'doc-001', pages: 8, kind: 'scan', readable: true }],
    }),
  ],
  pending_slices: [{ slice: 'late-decisive-evidence', reason: 'No supplied case has this slice yet' }],
};

function reconcileOf(docId, pages) {
  const method = 'ocr:local-stub';
  return {
    inventory: {
      status: 'complete',
      items: [{ id: docId, version: '1', state: 'processed', expectedPages: pages }],
    },
    results: [{
      docId,
      version: '1',
      pageCount: pages,
      gaps: [],
      pages: Array.from({ length: pages }, (_, i) => ({
        page: i + 1,
        method,
        passages: [{ method, text: 'Synthetic line', confidence: 0.95, lowConfidence: false }],
      })),
    }],
  };
}

function findingsOf(entry) {
  return {
    decisive: entry.annotation.decisive_facts.map((f) => ({
      annotationId: f.id,
      citation: { label: 'unverified', status: 'unverified', humanReview: false },
    })),
    contradictions: entry.annotation.contradictions.map((f) => ({ annotationId: f.id })),
    gaps: entry.annotation.gaps.map((f) => ({ annotationId: f.id })),
    other: otherIds.map((f) => ({ annotationId: f.id })),
  };
}

const observed = Object.fromEntries(manifest.cases.map((c) => [c.id, {
  documents: c.annotation.inventory.map((d) => ({ ...d })),
  findings: findingsOf(c),
  ...(c.id === 'case-synth05' ? { reconcile: reconcileOf('doc-001', 8) } : {}),
}]));

const otherFacts = Object.fromEntries(manifest.cases.map((c) => [c.id, otherIds.map((f) => ({ ...f }))]));

export function syntheticBundle(extra = {}) {
  return {
    kind: 'synthetic',
    manifest,
    observed,
    otherFacts,
    usageCaseId: 'case-synth01',
    ocr: {
      excerpts: [{ docId: 'doc-001', version: '1', page: 1, truth: 'Synthetic line', checkedBy: 'rev-synth01' }],
      results: [{ docId: 'doc-001', version: '1', pages: [{ page: 1, text: 'Synthetic line', method: 'ocr:local-stub' }] }],
      engine: {
        id: 'local-stub',
        network: false,
        async recognize() {
          return { lines: [{ text: 'Synthetic line', confidence: 0.95, bbox: [0, 0, 1, 1] }] };
        },
      },
      image: { bytes: new Uint8Array([0]), mime: 'image/png' },
    },
    method: {
      draft: {
        sections: [
          { id: 'relatorio', text: 'Synthetic section.', uses: [] },
          { id: 'fundamentacao', text: 'Synthetic section.', uses: [] },
          { id: 'dispositivo', text: 'Synthetic section.', uses: [] },
        ],
        conclusion: { reasoning: 'Synthetic reasoning.', uses: ['F1'] },
        addressed: [],
      },
      env: { docType: 'sentenca', outcome: null },
    },
    ...extra,
  };
}

export { manifest, observed, otherFacts };
