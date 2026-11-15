#!/usr/bin/env python3
"""Ground-truth audit of synthetic batch-triage fixtures (no skill text)."""
from __future__ import annotations

import pathlib
import re
import sys

FINDING_TUTELA = "tutela_pendente"
FINDING_LACUNA = "lacuna_caso"
FINDING_ORDEM = "ordem_tutela_materia"
FINDING_LOTE = "tres_casos_lote"


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def caso_materia(text: str) -> str | None:
    m = re.search(r"MATÉRIA:\s*(\S+)", text, re.I)
    return m.group(1).lower() if m else None


def caso_id(text: str) -> str | None:
    m = re.search(r"CASE_ID:\s*(\S+)", text)
    return m.group(1) if m else None


def has_tutela(text: str) -> bool:
    return bool(re.search(r"TUTELA_DE_URGENCIA:\s*pendente", text, re.I))


def has_lacuna(text: str) -> bool:
    return bool(re.search(r"LACUNA_PECA:\s*", text, re.I))


def audit(fixdir: pathlib.Path) -> set[str]:
    found: set[str] = set()
    manifest = read(fixdir / "lume-runtime-triagem-9-manifest.md")
    cases: list[tuple[str, str, pathlib.Path]] = []
    for n in (1, 2, 3):
        p = fixdir / f"lume-runtime-triagem-9-caso-0{n}.md"
        body = read(p)
        if body:
            cases.append((caso_id(body) or f"caso-0{n}", caso_materia(body) or "", p))

    if len(cases) == 3:
        found.add(FINDING_LOTE)

    tutela_ids: list[str] = []
    normal: list[tuple[str, str]] = []
    lacuna_ids: list[str] = []
    for cid, materia, path in cases:
        body = read(path)
        if has_tutela(body):
            tutela_ids.append(cid)
            found.add(FINDING_TUTELA)
        else:
            normal.append((cid, materia))
        if has_lacuna(body):
            lacuna_ids.append(cid)
            found.add(FINDING_LACUNA)

    # tutela first, then remaining cases by id (matéria grouping in host; id tie-break)
    computed = tutela_ids + [c for c, _ in sorted(normal, key=lambda x: x[0])]
    expected = [
        ln.strip()
        for ln in read(fixdir / "lume-runtime-triagem-9-ordem-esperada.txt").splitlines()
        if ln.strip() and not ln.startswith("#")
    ]
    if computed and expected and computed == expected:
        found.add(FINDING_ORDEM)

    if re.search(r"tres_casos_lote|lume-runtime-triagem-9-caso", manifest):
        pass  # manifest sanity only

    return found


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: lume_triagem_runtime.py <fixtures/n102-dir>", file=sys.stderr)
        sys.exit(2)
    fixdir = pathlib.Path(sys.argv[1])
    for tag in sorted(audit(fixdir)):
        print(tag)


if __name__ == "__main__":
    main()
