import { spawnSync } from "node:child_process";
const [, , rounds = "200", good, script] = process.argv;
const N = Number(rounds);
const variants = {
  floor: ["-I", "-S", "-c", "pass"],
  "import _json": ["-I", "-S", "-c", "import _json"],
  "import os": ["-I", "-S", "-c", "import os"],
  "import re": ["-I", "-S", "-c", "import re"],
  "import json": ["-I", "-S", "-c", "import json"],
  "import json,os,re,types": ["-I", "-S", "-c", "import json,os,re,types"],
  "script package": ["-I", "-S", script, "package", good],
};
const names = Object.keys(variants);
const t = Object.fromEntries(names.map((n) => [n, []]));
for (let i = 0; i < N; i++) {
  const order = i % 2 ? [...names].reverse() : names;
  for (const n of order) {
    const s = process.hrtime.bigint();
    const r = spawnSync("python3", variants[n], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, stdio: "ignore" });
    t[n].push(Number(process.hrtime.bigint() - s) / 1e6);
    if (r.status !== 0) throw new Error(`${n} exit ${r.status}`);
  }
}
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const floor = med(t.floor);
for (const n of names) console.log(n.padEnd(26), med(t[n]).toFixed(3), "ms", "  over floor", (med(t[n]) - floor).toFixed(3));
