import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildProject, projectDir } from "../scripts/build-zip.mjs";
import {
  loadEntry,
  marketplacePath,
  mergeMarketplace,
  writeMarketplace,
} from "../scripts/merge-marketplace.mjs";

const pluginRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../lume-jef",
);
const installScript = path.join(pluginRoot, "instalar/instalar-plugin.ps1");

test("marketplace template is the lume-jef entry", async () => {
  const entry = await loadEntry();
  assert.deepEqual(entry, {
    name: "lume-jef",
    source: { source: "local", path: "./.codex/plugins/lume-jef" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity",
  });
});

test("marketplace merge keeps other entries and is idempotent", async () => {
  const entry = await loadEntry();
  const other = {
    name: "outro",
    source: { source: "local", path: "./.codex/plugins/outro" },
    note: "ficar",
  };
  const existing = {
    name: "pessoal",
    extra: { keep: true },
    interface: { displayName: "Outros", tint: "#fff" },
    plugins: [
      { name: "lume-jef", source: { path: "./errado" } },
      other,
      { name: "lume-jef", source: { path: "./duplicado" } },
    ],
  };
  const merged = mergeMarketplace(existing, entry);
  assert.equal(merged.name, "lume-local");
  assert.equal(merged.interface.displayName, "Lume");
  assert.equal(merged.interface.tint, "#fff");
  assert.equal(merged.extra.keep, true);
  assert.deepEqual(
    merged.plugins.map((plugin) => plugin.name),
    ["lume-jef", "outro"],
  );
  assert.deepEqual(merged.plugins[0], entry);
  assert.deepEqual(merged.plugins[1], other);
  assert.deepEqual(mergeMarketplace(merged, entry), merged);

  const home = await mkdtemp(path.join(os.tmpdir(), "lume-market-"));
  try {
    await mkdir(path.dirname(marketplacePath(home)), { recursive: true });
    await writeFile(marketplacePath(home), "{");
    await assert.rejects(writeMarketplace(home));
    assert.equal(await readFile(marketplacePath(home), "utf8"), "{");
    await rm(marketplacePath(home));
    const created = await writeMarketplace(home);
    assert.equal(created.plugins.length, 1);
    assert.equal(created.name, "lume-local");
    const again = await writeMarketplace(home);
    assert.deepEqual(again, created);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("installer script merges marketplace.json under USERPROFILE", async () => {
  const probe = spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"], {
    encoding: "utf8",
  });
  if (probe.status !== 0) return;

  const entry = await loadEntry();
  const home = await mkdtemp(path.join(os.tmpdir(), "lume-home-"));
  const other = { name: "outro", source: { path: "./outro" }, note: "ficar" };
  try {
    const seeded = {
      name: "pessoal",
      plugins: [other, { name: "lume-jef", source: { path: "./errado" } }],
    };
    await mkdir(path.dirname(marketplacePath(home)), { recursive: true });
    await writeFile(marketplacePath(home), JSON.stringify(seeded));
    const run = () =>
      spawnSync("pwsh", ["-NoProfile", "-File", installScript], {
        encoding: "utf8",
        env: { ...process.env, USERPROFILE: home, HOME: home },
      });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Reinicie o app ChatGPT e instale Lume JEF em Plugins > Lume/);
    const written = JSON.parse(await readFile(marketplacePath(home), "utf8"));
    assert.deepEqual(written, mergeMarketplace(seeded, entry));
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    const repeated = JSON.parse(await readFile(marketplacePath(home), "utf8"));
    assert.deepEqual(repeated, written);
    await writeFile(marketplacePath(home), "{");
    const broken = run();
    assert.notEqual(broken.status, 0);
    assert.equal(await readFile(marketplacePath(home), "utf8"), "{");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("project folder flattens each skill and a paste note", async () => {
  const written = await buildProject();
  assert.ok(written.includes("jef-director.md"));
  assert.ok(written.includes("COLE-NO-PROJETO.md"));
  assert.equal(written.length, 12);
  const director = await readFile(path.join(projectDir, "jef-director.md"), "utf8");
  assert.match(director, /revisão C8 do modelo/);
  assert.match(director, /IDP-001/);
  const note = await readFile(path.join(projectDir, "COLE-NO-PROJETO.md"), "utf8");
  assert.match(note, /Cole este arquivo nas instruções do Project/);
  assert.ok(note.length < 800);
  const steps = (await readFile(path.join(pluginRoot, "LEIA-ME.md"), "utf8"))
    .split("\n")
    .filter((line) => /^\d+\.\s/.test(line));
  assert.equal(steps.length, 3);
});
