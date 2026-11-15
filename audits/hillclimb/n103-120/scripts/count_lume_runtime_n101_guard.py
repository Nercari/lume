#!/usr/bin/env python3
"""N101 runtime guard: keep climb 8 leitura harness at zero."""
from __future__ import annotations

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
HERE = pathlib.Path(__file__).resolve().parent.parent
FIX = HERE / "scripts/fixtures/n101"
AUDIT = HERE / "scripts/lume_leitura_runtime.py"
COUNT_E2E = HERE / "scripts/count_lume_e2e.py"
COUNT_NORTH = HERE / "scripts/count_lume_north.py"
COUNT_OPEN = HERE / "scripts/count_lume_open.py"
COUNT_DAILY = HERE / "scripts/count_lume_daily.py"
COUNT_HARD = HERE / "scripts/count_lume_hard.py"
LINT = HERE / "scripts/lint_lume_plugin.py"

CASE_ID = "lume-runtime-leitura-8"


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


def run_leitura_audit() -> set[str]:
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
    pacote = read("skills/jef-pacote/SKILL.md")
    formato = read("skills/jef-pacote/references/formato.md")
    work = read("skills/jef-work/SKILL.md")
    triagem = read("skills/jef-triagem/SKILL.md")
    cenarios = read("skills/jef-revisao/references/cenarios.md")
    return pacote + formato + work + triagem + cenarios


def n101_runtime_gaps() -> list[str]:
    gaps: list[str] = []
    pacote = read("skills/jef-pacote/SKILL.md")
    work = read("skills/jef-work/SKILL.md")
    triagem = read("skills/jef-triagem/SKILL.md")
    blob = skill_blob()
    findings = run_leitura_audit()

    if not cenarios_has(CASE_ID):
        gaps.append("RT101-a")

    if "parte_ausente" not in findings:
        gaps.append("HARNESS:RT101-b")
    elif not re.search(r"lacunas|faltar parte", pacote, re.I):
        gaps.append("RT101-b")

    if "pagina_imagem" not in findings:
        gaps.append("HARNESS:RT101-c")
    elif not re.search(r"visão|lido por visão", pacote, re.I):
        gaps.append("RT101-c")

    if "export_documento" not in findings:
        gaps.append("HARNESS:RT101-d")
    elif not re.search(r"## Documento", pacote):
        gaps.append("RT101-d")

    if "lacuna_parte_nominal" not in findings:
        gaps.append("HARNESS:RT101-e")
    elif not re.search(
        r"antes do relatório ou da minuta",
        pacote,
        re.I,
    ):
        gaps.append("RT101-e")

    if not (
        re.search(r"OCR|Tesseract", pacote, re.I)
        and re.search(r"lido por visão", pacote, re.I)
    ):
        gaps.append("RT101-f")

    if not re.search(r"ID na origem", pacote):
        gaps.append("RT101-g")

    route = (
        "jef-pacote" in work
        and "jef-pacote" in triagem
        and re.search(r"não presume|não invente", pacote, re.I)
    )
    if not route:
        gaps.append("RT101-h")

    if CASE_ID not in blob:
        gaps.append("RT101-i")

    return gaps


def all_open() -> list[str]:
    items: list[str] = []
    if os.environ.get("LUME_RUNTIME_N101_PLANT") == "1":
        items.append("PLANT:test-runtime")
    items.extend(run_guard(COUNT_E2E, "e2e", r"E2E_SCORE:\s*(\d+)"))
    items.extend(run_guard(COUNT_NORTH, "north", r"NORTH:\s*(\d+)"))
    items.extend(run_guard(COUNT_OPEN, "open", r"OPEN:\s*(\d+)"))
    items.extend(run_guard(COUNT_DAILY, "daily", r"DAILY:\s*(\d+)"))
    items.extend(run_guard(COUNT_HARD, "hard", r"HARD:\s*(\d+)"))
    items.extend(run_guard(LINT, "lint", r"VIOLATIONS:\s*(\d+)"))
    items.extend(n101_runtime_gaps())
    return items


def main() -> None:
    gaps = n101_runtime_gaps()
    findings = sorted(run_leitura_audit())
    print(f"RUNTIME_FINDINGS: {len(findings)}")
    for f in findings:
        print(f)
    print(f"N101-runtime-steps: {len(gaps)}")
    for g in gaps:
        print(g)
    items = all_open()
    print(f"RUNTIME_SCORE: {len(items)}")
    for item in items:
        print(item)


if __name__ == "__main__":
    main()
