#!/usr/bin/env python3
"""N103 runtime check: relatorio structure, the "Posicao a ser adotada" pause and the Voto-Ementa.

Prints one number: RUNTIME_SCORE (open items, lower is better). Usage: count_lume_runtime.py <plugin-dir>
"""
from __future__ import annotations

import hashlib
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
HERE = pathlib.Path(__file__).resolve().parent.parent
S = HERE / "scripts"
FIX = S / "fixtures/n103"
AUDIT = S / "lume_relvoto_runtime.py"
CASE_ID = "lume-runtime-relvoto-10"
GUARDS = (
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
    "RT103-e": ("escolha_libera_voto",),
    "RT103-f": ("perfil_neutro_menos_de_tres",),
    "RT103-g": ("voto_ementa_forma", "voto_segue_posicao"),
    "RT103-o": ("quatro_pede_posicao",),
}


def read(rel: str) -> str:
    p = ROOT / rel
    return re.sub(r"[ \t]*\n[ \t]*", " ", p.read_text(encoding="utf-8")) if p.is_file() else ""


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?:])\s+", text) if s]


def has_sentence(text: str, *pats: str) -> bool:
    """One sentence of 8 to 70 words holds every pattern in the given order (blocks keyword stuffing)."""
    for s in sentences(text):
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


def run_guard(script: str, label: str, score_re: str) -> list[str]:
    out = subprocess.run([sys.executable, str(S / script), str(ROOT)], capture_output=True, text=True, check=False)
    m = re.search(score_re, out.stdout + out.stderr)
    if not m:
        return [f"GUARD:{label}:check-error"]
    return [f"GUARD:{label}:{m.group(1)}"] if int(m.group(1)) else []


def audit() -> set[str]:
    out = subprocess.run([sys.executable, "-I", str(AUDIT), str(FIX)], capture_output=True, text=True, check=False)
    return {ln.strip() for ln in out.stdout.splitlines() if ln.strip()} if out.returncode == 0 else set()


def fixtures_locked() -> bool:
    ref = S / "fixtures/n103.sha256"
    if not ref.is_file():
        return False
    want = dict(reversed(ln.split(None, 1)) for ln in ref.read_text().splitlines() if ln.strip())
    got = {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(FIX.iterdir())}
    return {k.strip(): v for k, v in want.items()} == {k: v for k, v in got.items()}


def n103_gaps() -> list[str]:
    gaps: list[str] = []
    found = audit()
    rel = read("skills/jef-relatorio/SKILL.md")
    voto = read("skills/jef-voto/SKILL.md")
    c4 = read("skills/jef-relatorio/references/c4.md")
    c6 = read("skills/jef-voto/references/c6.md")
    cen = read("skills/jef-revisao/references/cenarios.md")
    dire = read("skills/jef-director/references/diretor.md")
    hold = r"pausa|não redij|mantenh|permane|continu"

    steps = {
        "RT103-a": CASE_ID in cen,
        "RT103-b": "Posição a ser adotada" in rel and bool(re.search(r"\bpare\b", rel)) and "2.3" in c4 + rel,
        "RT103-c": has_sentence(rel, r"nomes? completos?", r"segredo de justiça"),
        "RT103-d": any(has_sentence(t, r"outra resposta|qualquer outra|nenhum d|nem n[úu]mero|não for", r"n[úu]mero", r"posição", hold)
                       for t in (voto, rel, c6)),
        "RT103-e": bool(re.search(r"não reconfirm", c6)) and bool(re.search(r"Depois que a posição for definida", c6)),
        "RT103-f": any(has_sentence(t, r"3 a 6 votos", r"menos de 3|fora desse|sem perfil|ausência|neutro", r"JEF-V1") for t in (voto, c6)),
        "RT103-g": all(re.search(p, c6) for p in (r"caixa alta e negrito", r"sem rótulo VOTO-EMENTA", r"numeração manual", r"ponto e vírgula")),
        "RT103-h": "## Posição antes da minuta" in dire and len(dire.split()) <= 430,
        "RT103-o": any(has_sentence(t, r"\b4\b|quarta", r"peça|solicite|pergunte", r"texto|escrit", r"posição") for t in (voto, rel, c6, dire)),
    }
    for step, ok in steps.items():
        need = NEEDS.get(step, ())
        if any(n not in found for n in need):
            gaps.append(f"HARNESS:{step}")
        elif not ok:
            gaps.append(step)
    if not fixtures_locked():
        gaps.append("HARNESS:fixtures-changed")
    return gaps


def main() -> None:
    gaps = n103_gaps()
    findings = sorted(audit())
    print(f"RUNTIME_FINDINGS: {len(findings)}")
    for f in findings:
        print(f)
    print(f"N103-runtime-steps: {len(gaps)}")
    items: list[str] = []
    if os.environ.get("LUME_RUNTIME_N103_PLANT") == "1":
        items.append("PLANT:test-runtime")
    for label, script, rx in GUARDS:
        items.extend(run_guard(script, label, rx))
    items.extend(gaps)
    print(f"RUNTIME_SCORE: {len(items)}")
    for item in items:
        print(item)


if __name__ == "__main__":
    main()
