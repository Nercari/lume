#!/usr/bin/env python3
"""N106 runtime: execute synthetic minuta audit and count missing host steps."""
from __future__ import annotations

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
HERE = pathlib.Path(__file__).resolve().parent.parent
FIX = HERE / "scripts/fixtures/n106"
AUDIT = HERE / "scripts/lume_revisao_runtime.py"
COUNT_E2E = HERE / "scripts/count_lume_e2e.py"
COUNT_NORTH = HERE / "scripts/count_lume_north.py"
COUNT_OPEN = HERE / "scripts/count_lume_open.py"
COUNT_DAILY = HERE / "scripts/count_lume_daily.py"
COUNT_HARD = HERE / "scripts/count_lume_hard.py"
LINT = HERE / "scripts/lint_lume_plugin.py"

CASE_ID = "lume-runtime-revisao-7"
PECAS = FIX / f"{CASE_ID}-pecas.md"
MINUTA = FIX / f"{CASE_ID}-minuta.md"

# Locked runtime steps for N106 (new ids, one case file pair)
RT_STEPS = (
    "RT106-a",  # cenarios.md registers case
    "RT106-b",  # runtime: dispositivo vs fundamentação + skill
    "RT106-c",  # runtime: valor divergente + skill
    "RT106-d",  # runtime: pedido autônomo sem resposta + skill
    "RT106-e",  # skill: tabela de achados
    "RT106-f",  # skill: não declarar pronta com achado material
    "RT106-g",  # skill: c8 antes da entrega
    "RT106-h",  # skill: nomeia o fixture de runtime
)


def read(rel: str) -> str:
    p = ROOT / rel
    return p.read_text(encoding="utf-8") if p.is_file() else ""


def run_guard(script: pathlib.Path, label: str, score_re: str) -> list[str]:
    out = subprocess.run(
        [sys.executable, str(script), str(ROOT)],
        capture_output=True,
        text=True,
        check=False,
    )
    blob = out.stdout + out.stderr
    m = re.search(score_re, blob)
    if not m:
        return [f"GUARD:{label}:check-error"]
    n = int(m.group(1))
    if n:
        return [f"GUARD:{label}:{n}"]
    return []


def run_runtime_audit() -> set[str]:
    out = subprocess.run(
        [sys.executable, str(AUDIT), str(PECAS), str(MINUTA)],
        capture_output=True,
        text=True,
        check=False,
    )
    if out.returncode != 0:
        return set()
    return {ln.strip() for ln in out.stdout.splitlines() if ln.strip()}


def cenarios_has(tag: str) -> bool:
    return tag in read("skills/jef-revisao/references/cenarios.md")


def skill_blob() -> str:
    return read("skills/jef-revisao/SKILL.md") + read("skills/jef-revisao/references/c8.md")


def n106_runtime_gaps() -> list[str]:
    gaps: list[str] = []
    revisao = read("skills/jef-revisao/SKILL.md")
    c8 = read("skills/jef-revisao/references/c8.md")
    blob = revisao + c8
    findings = run_runtime_audit()

    if not cenarios_has(CASE_ID):
        gaps.append("RT106-a")

    if "dispositivo_incoerente" not in findings:
        gaps.append("HARNESS:RT106-b")
    elif not re.search(
        r"dispositivo.*fundamentação|fundamentação.*dispositivo",
        blob,
        re.I | re.S,
    ):
        gaps.append("RT106-b")

    if "valor_divergente" not in findings:
        gaps.append("HARNESS:RT106-c")
    elif not (re.search(r"valor", revisao, re.I) and re.search(r"valor", c8, re.I)):
        gaps.append("RT106-c")

    if "pedido_sem_resposta" not in findings:
        gaps.append("HARNESS:RT106-d")
    elif not re.search(r"pedido", revisao, re.I):
        gaps.append("RT106-d")

    if "tabela com trecho, problema" not in revisao:
        gaps.append("RT106-e")

    if not re.search(
        r"não declare.*pronta para assinar|não diga que.*pronta para assinar|achado material",
        revisao,
        re.I | re.S,
    ):
        gaps.append("RT106-f")

    if "references/c8.md" not in revisao or not re.search(
        r"integralmente|antes de entregar",
        revisao,
        re.I,
    ):
        gaps.append("RT106-g")

    if CASE_ID not in blob and CASE_ID not in read("skills/jef-revisao/references/cenarios.md"):
        gaps.append("RT106-h")

    return gaps


def all_open() -> list[str]:
    items: list[str] = []
    if os.environ.get("LUME_RUNTIME_PLANT") == "1":
        items.append("PLANT:test-runtime")
    items.extend(run_guard(COUNT_E2E, "e2e", r"E2E_SCORE:\s*(\d+)"))
    items.extend(run_guard(COUNT_NORTH, "north", r"NORTH:\s*(\d+)"))
    items.extend(run_guard(COUNT_OPEN, "open", r"OPEN:\s*(\d+)"))
    items.extend(run_guard(COUNT_DAILY, "daily", r"DAILY:\s*(\d+)"))
    items.extend(run_guard(COUNT_HARD, "hard", r"HARD:\s*(\d+)"))
    items.extend(run_guard(LINT, "lint", r"VIOLATIONS:\s*(\d+)"))
    items.extend(n106_runtime_gaps())
    return items


def main() -> None:
    gaps = n106_runtime_gaps()
    findings = sorted(run_runtime_audit())
    print(f"RUNTIME_FINDINGS: {len(findings)}")
    for f in findings:
        print(f)
    print(f"N106-runtime-steps: {len(gaps)}")
    for g in gaps:
        print(g)
    items = all_open()
    print(f"RUNTIME_SCORE: {len(items)}")
    for item in items:
        print(item)


if __name__ == "__main__":
    main()
