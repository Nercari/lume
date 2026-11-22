# Parts grid check

Synthetic check for the multi-part case pack (`manual/src/parts.js`). All inputs are generated in the script. No case data, no network, no model, no install.

Run: `node audits/hillclimb/parts-grid/check.mjs`. It prints `parts-grid: cells=N failing=K`. The score is `K` (direction min, target 0). The run is deterministic and takes about 1 second.

Grid: 1, 2, 5, 12 or 40 documents; 50 to 120,000 characters per document, in one paragraph or three; `maxChars` 5,000, 12,000, 50,000 or 350,000. The cell with 40 documents and 5,000 characters is skipped: the part 1 index alone is about 4.3 kB there.

A cell fails when any of these breaks:

- `roundtrip`: the part passages, without continuation tags and ignoring whitespace, differ from the single pack passages.
- `oversize`: a part is longer than `maxChars`.
- `name`, `frame`: a file name, the "parte k de N" header or the "FIM DA PARTE k DE N" footer is wrong.
- `untagged`: a part does not open its passages with an `[ID x, pág. y]` tag.
- `index`: a document row in the part 1 index does not list exactly the parts that hold its passages.
- `split`: the part count is below the least possible or above twice that plus 2 (stops a fix that ignores `maxChars` or cuts text into crumbs).

Guard: `node audits/hillclimb/parts-grid/guard.mjs` keeps the public contract (names, default size, exact output for small cases). The folder is locked: the climber edits `manual/src/parts.js` or `manual/src/pack.js` only.

Known-bad edits (checked on 2026-11-22, on `origin/main` 0316511): cutting each passage to 1,500 characters scores 133; forcing `maxChars` to 1e12 scores 99. Both are worse than the 41 of the start, so neither is rewarded.
