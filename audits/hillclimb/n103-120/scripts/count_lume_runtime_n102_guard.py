#!/usr/bin/env python3
"""N102 runtime: synthetic batch triage audit and missing host steps."""
from __future__ import annotations

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
HERE = pathlib.Path(__file__).resolve().parent.parent
FIX = HERE / "scripts/fixtures/n102"
AUDIT = HERE / "scripts/lume_triagem_runtime.py"
COUNT_E2E = HERE / "scripts/count_lume_e2e.py"
COUNT_NORTH = HERE / "scripts/count_lume_north.py"
COUNT_OPEN = HERE / "scripts/count_lume_open.py"
COUNT_DAILY = HERE / "scripts/count_lume_daily.py"
COUNT_HARD = HERE / "scripts/count_lume_hard.py"
COUNT_N106 = HERE / "scripts/count_lume_runtime_n106_guard.py"
COUNT_N101 = HERE / "scripts/count_lume_runtime_n101_guard.py"
LINT = HERE / "scripts/lint_lume_plugin.py"

CASE_ID = "lume-runtime-triagem-9"

RT_STEPS = (
    "RT102-a",
    "RT102-b",
    "RT102-c",
    "RT102-d",
    "RT102-e",
    "RT102-f",
    "RT102-g",
    "RT102-h",
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


def run_triagem_audit() -> set[str]:
    out = subprocess.run(
        [sys.executable, str(AUDIT), str(FIX)],
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
    lote = read("skills/jef-lote/SKILL.md")
    triagem = read("skills/jef-triagem/SKILL.md")
    cenarios = read("skills/jef-revisao/references/cenarios.md")
    return lote + triagem + cenarios


def n102_runtime_gaps() -> list[str]:
    gaps: list[str] = []
    lote = read("skills/jef-lote/SKILL.md")
    triagem = read("skills/jef-triagem/SKILL.md")
    blob = skill_blob()
    findings = run_triagem_audit()

    if not cenarios_has(CASE_ID):
        gaps.append("RT102-a")

    if "tutela_pendente" not in findings:
        gaps.append("HARNESS:RT102-b")
    elif not (
        re.search(r"tutela", lote, re.I)
        and re.search(r"prioridade legal ou tutela", lote, re.I)
    ):
        gaps.append("RT102-b")

    if "ordem_tutela_materia" not in findings:
        gaps.append("HARNESS:RT102-c")
    elif not (
        re.search(r"matéria", lote)
        and re.search(r"prioridade legal ou tutela e matéria", lote, re.I)
    ):
        gaps.append("RT102-c")

    if "lacuna_caso" not in findings:
        gaps.append("HARNESS:RT102-d")
    elif not re.search(r"lacunas e pendências", lote, re.I):
        gaps.append("RT102-d")

    if "tres_casos_lote" not in findings:
        gaps.append("HARNESS:RT102-e")
    elif not re.search(r"Feche a leva", lote):
        gaps.append("RT102-e")

    if "tres_casos_lote" not in findings:
        gaps.append("HARNESS:RT102-f")
    elif "CASE_STATE" not in lote:
        gaps.append("RT102-f")

    if not (
        re.search(r"prioridade legal ou tutela", triagem, re.I)
        and re.search(r"matéria", triagem)
    ):
        gaps.append("RT102-g")

    if CASE_ID not in blob:
        gaps.append("RT102-h")

    return gaps


def all_open() -> list[str]:
    items: list[str] = []
    if os.environ.get("LUME_RUNTIME_N102_PLANT") == "1":
        items.append("PLANT:test-runtime")
    items.extend(run_guard(COUNT_E2E, "e2e", r"E2E_SCORE:\s*(\d+)"))
    items.extend(run_guard(COUNT_NORTH, "north", r"NORTH:\s*(\d+)"))
    items.extend(run_guard(COUNT_OPEN, "open", r"OPEN:\s*(\d+)"))
    items.extend(run_guard(COUNT_DAILY, "daily", r"DAILY:\s*(\d+)"))
    items.extend(run_guard(COUNT_HARD, "hard", r"HARD:\s*(\d+)"))
    items.extend(run_guard(LINT, "lint", r"VIOLATIONS:\s*(\d+)"))
    items.extend(run_guard(COUNT_N106, "runtime-n106", r"RUNTIME_SCORE:\s*(\d+)"))
    items.extend(run_guard(COUNT_N101, "runtime-n101", r"RUNTIME_SCORE:\s*(\d+)"))
    items.extend(n102_runtime_gaps())
    return items


def main() -> None:
    gaps = n102_runtime_gaps()
    print(f"RUNTIME_SCORE: {len(gaps)}")
    for g in gaps:
        print(g)


if __name__ == "__main__":
    main()
