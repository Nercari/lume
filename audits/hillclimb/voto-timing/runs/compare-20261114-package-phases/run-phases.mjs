// 200 fresh interpreters per probe; medians. Floors: python3 -I -S -c pass, and full validator spawn.
import { spawnSync } from "node:child_process";
const [validator, pack, rounds = "200"] = process.argv.slice(2);
const N = Number(rounds), probe = new URL("./phase-probe.py", import.meta.url).pathname;
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const ms = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };
const phases = {}, floor = [], full = [];
for (let i = 0; i < N; i++) {
  const r = spawnSync("python3", ["-I", "-S", probe, validator, pack], { encoding: "utf8" });
  for (const [k, v] of Object.entries(JSON.parse(r.stdout))) (phases[k] ??= []).push(v);
  floor.push(ms(() => spawnSync("python3", ["-I", "-S", "-c", "pass"])));
  full.push(ms(() => spawnSync("python3", ["-I", "-S", validator, "package", pack])));
}
const out = { label: "SYNTHETIC PROXY. Local engineering timing only.", rounds: N, interpreterStartFloor_ms: +med(floor).toFixed(3), fullSpawnCheck_ms: +med(full).toFixed(3), phases_ms: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, +med(v).toFixed(3)])) };
console.log(JSON.stringify(out, null, 2));
