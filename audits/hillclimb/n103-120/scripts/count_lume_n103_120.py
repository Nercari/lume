#!/usr/bin/env python3
"""N103 runtime check on Lume 1.2.0. Scores the tracked source plugins/lume-workspace and the plugin
generated from it (plugins/lume-claude). Synthetic fixtures only. Prints one line: RUNTIME_SCORE: <n>.
Items go to stderr. Lower is better; 0 means every N103 rule is stated in both trees, no guard is worse
than its recorded 1.2.0 baseline, and lume-claude equals the build output.

usage: count_lume_n103_120.py [--root <repo>]   (default: the repo that holds this file)
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
S = HERE / "scripts"
FIX = S / "fixtures"
REPO = pathlib.Path(sys.argv[sys.argv.index("--root") + 1]).resolve() if "--root" in sys.argv else HERE.parents[2]
TARGETS = ("lume-workspace", "lume-claude")
GUARDS = (  # label, script, score regex
    ("e2e", "count_lume_e2e.py", r"E2E_SCORE:\s*(\d+)"),
    ("north", "count_lume_north.py", r"NORTH:\s*(\d+)"),
    ("open", "count_lume_open.py", r"OPEN:\s*(\d+)"),
    ("daily", "count_lume_daily.py", r"DAILY:\s*(\d+)"),
    ("hard", "count_lume_hard.py", r"HARD:\s*(\d+)"),
    ("lint", "lint_lume_plugin.py", r"VIOLATIONS:\s*(\d+)"),
    ("runtime-n106", "count_lume_runtime_n106_guard.py", r"RUNTIME_SCORE:\s*(\d+)"),
    ("runtime-n101", "count_lume_runtime_n101_guard.py", r"RUNTIME_SCORE:\s*(\d+)"),
    ("runtime-n102", "count_lume_runtime_n102_guard.py", r"RUNTIME_SCORE:\s*(\d+)"),
)
# audit finding each step needs; a missing finding means the audit missed it (HARNESS)
NEEDS = {
    "RT103-b": ("relatorio_hierarquia", "posicao_quatro_opcoes", "pausa_sem_voto"),
    "RT103-c": ("nomes_completos", "sem_ressalva"),
    "RT103-d": ("nao_escolha_mantem_pausa",),
    "RT103-p": ("pode_seguir_delega",),
    "RT103-e": ("escolha_libera_voto",),
    "RT103-f": ("perfil_neutro_menos_de_tres",),
    "RT103-g": ("voto_ementa_forma", "voto_segue_posicao"),
    "RT103-o": ("quatro_pede_posicao",),
}


def flat(p: pathlib.Path) -> str:
    return re.sub(r"[ \t]*\n[ \t]*", " ", p.read_text(encoding="utf-8")) if p.is_file() else ""


def has_sentence(text: str, *pats: str) -> bool:
    """One sentence of 8 to 70 words holds every pattern in the given order (blocks keyword stuffing)."""
    for s in (x for x in re.split(r"(?<=[.!?:])\s+", text) if x):
        if not 8 <= len(s.split()) <= 70:
            continue
        pos = 0
        for p in pats:
            m = re.compile(p, re.I).search(s, pos)
            if not m:
                break
            pos = m.end()
        else:
            return True
    return False


def audit() -> set[str]:
    out = subprocess.run([sys.executable, "-I", str(S / "lume_relvoto_runtime.py"), str(FIX / "n103")],
                         capture_output=True, text=True, check=False)
    return {ln.strip() for ln in out.stdout.splitlines() if ln.strip()} if out.returncode == 0 else set()


def fixtures_locked() -> bool:
    ref = S / "fixtures.sha256"
    if not ref.is_file():
        return False
    want = {ln.split(None, 1)[1].strip(): ln.split()[0] for ln in ref.read_text().splitlines() if ln.strip()}
    got = {str(f.relative_to(FIX)): hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(FIX.rglob("*")) if f.is_file()}
    return want == got


def steps(t: pathlib.Path) -> dict[str, bool]:
    sk = t / "skills"
    rel, c4 = flat(sk / "jef-relatorio/SKILL.md"), flat(sk / "jef-relatorio/references/c4.md")
    voto, c6 = flat(sk / "jef-voto/SKILL.md"), flat(sk / "jef-voto/references/c6.md")
    dire, ctr = flat(sk / "jef-director/SKILL.md"), flat(sk / "jef-director/references/contrato.md")
    prof = flat(sk / "jef-director/references/profiles.md")
    estilo = flat(sk / "jef-estilo/SKILL.md")
    everywhere = (rel, c4, voto, c6, dire, ctr, prof)
    hold = r"pausa|não redij|mantenh|permane|continu"
    pos = "Posição a ser adotada"
    return {
        "RT103-b": bool(re.search(r"1 Sentença; 1\.1 .*1\.2 .*2 Recurso .*2\.1 .*2\.2 .*2\.3", ctr + c4 + rel))
                   and any(pos in x for x in (rel, c4, ctr, dire)) and any(re.search(r"\bpare\b", x) for x in (rel, c4, ctr, dire)),
        "RT103-c": any(has_sentence(x, r"nomes? completos?", r"segredo de justiça") for x in (rel, c4, c6, ctr)),
        "RT103-d": any(has_sentence(x, r"outra resposta|qualquer outra|nenhum d|nem n[úu]mero|não for", r"n[úu]mero", r"posição", hold)
                       for x in everywhere),
        "RT103-p": any(has_sentence(x, r"pode seguir", r"posição", r"delega|escolh") for x in everywhere),
        "RT103-e": any(re.search(r"não reconfirm|dispensa reconfirma", x) for x in (voto, c6, ctr)),
        "RT103-f": any(has_sentence(x, r"3 a 6 votos", r"menos de 3|fora desse|sem perfil|ausência|neutro", r"JEF-V1")
                       for x in (voto, c6, prof, ctr, estilo)),
        "RT103-g": all(re.search(p, c6) for p in (r"caixa alta e negrito", r"sem rótulo VOTO-EMENTA", r"numeração manual", r"ponto e vírgula")),
        "RT103-h": any(re.search(r"Posição antes da minuta|" + pos, x) for x in (dire, ctr)) and len(dire.split()) <= 430,
        "RT103-o": any(has_sentence(x, r"\b4\b|quarta", r"peça|solicite|pergunte", r"texto|escrit", r"posição") for x in everywhere),
    }


def guard_value(label: str, script: str, rx: str, target: str) -> int | str:
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    out = subprocess.run([sys.executable, str(S / script), str(REPO / "plugins" / target)],
                         capture_output=True, text=True, check=False, env=env)
    m = re.search(rx, out.stdout)
    return int(m.group(1)) if m else "check-error"


def main() -> None:
    items: list[str] = []
    if os.environ.get("LUME_RUNTIME_N103_PLANT") == "1":
        items.append("PLANT:test-runtime")
    if not fixtures_locked():
        items.append("HARNESS:fixtures-changed")
    found = audit()
    base = json.loads((S / "baseline-1.2.0.json").read_text()) if (S / "baseline-1.2.0.json").is_file() else {}
    try:
        build = subprocess.run(["node", str(REPO / "plugins/scripts/build-lume-claude.mjs"), "--check"],
                               capture_output=True, text=True, check=False)
        if build.returncode:
            items.append("DRIFT:lume-claude-differs-from-build")
    except FileNotFoundError:
        items.append("HARNESS:node-missing")
    for target in TARGETS:
        for step, ok in steps(REPO / "plugins" / target).items():
            if any(n not in found for n in NEEDS.get(step, ())):
                items.append(f"HARNESS:{step}:{target}")
            elif not ok:
                items.append(f"{step}:{target}")
        for label, script, rx in GUARDS:
            cur, was = guard_value(label, script, rx, target), base.get(target, {}).get(label)
            if was is None:
                items.append(f"HARNESS:no-baseline:{target}:{label}")
            elif cur == "check-error" and was != "check-error":
                items.append(f"GUARD:{target}:{label}:check-error")
            elif isinstance(cur, int) and isinstance(was, int) and cur > was:
                items.append(f"GUARD:{target}:{label}:{cur}>{was}")
    for it in items:
        print(it, file=sys.stderr)
    print(f"RUNTIME_SCORE: {len(items)}")


if __name__ == "__main__":
    main()
