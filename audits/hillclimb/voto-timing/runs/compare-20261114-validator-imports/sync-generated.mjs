// Updates generated copies without deleting: build() returns a Map and removes nothing.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, OUT } from "../../../../../plugins/scripts/build-lume-claude.mjs";

const list = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join("/")],
  );

const files = build();
const onDisk = new Set(list(OUT));
const extra = [...onDisk].filter((f) => !files.has(f));
const missing = [...files.keys()].filter((f) => !onDisk.has(f));
if (extra.length || missing.length) {
  console.log(`KEYSET DIFFERS\nextra: ${JSON.stringify(extra)}\nmissing: ${JSON.stringify(missing)}`);
  process.exit(1);
}
console.log(`keysets equal: ${files.size} files`);
const written = [];
for (const [f, d] of files) {
  if (!readFileSync(path.join(OUT, f)).equals(d)) {
    writeFileSync(path.join(OUT, f), d);
    written.push(f);
  }
}
console.log(`written ${written.length}:\n${written.join("\n")}`);
