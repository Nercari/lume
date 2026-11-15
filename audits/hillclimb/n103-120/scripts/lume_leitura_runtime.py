#!/usr/bin/env python3
"""Ground-truth inventory of synthetic peças fixtures (no skill text)."""
from __future__ import annotations

import pathlib
import re
import sys

FINDING_PARTE = "parte_ausente"
FINDING_IMAGEM = "pagina_imagem"
FINDING_EXPORT = "export_documento"
FINDING_LACUNA = "lacuna_parte_nominal"


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def audit(fixdir: pathlib.Path) -> set[str]:
    found: set[str] = set()
    manifest = read(fixdir / "lume-runtime-leitura-8-manifest.md")
    parte1 = read(fixdir / "lume-runtime-leitura-8-parte-01-de-02.md")
    imagem = read(fixdir / "lume-runtime-leitura-8-imagem.md")
    inteiro = read(fixdir / "lume-runtime-leitura-8-inteiro-teor.md")

    if re.search(r"parte-02-de-02.*ausente|lacuna de parte", manifest, re.I):
        if parte1 and not (fixdir / "lume-runtime-leitura-8-parte-02-de-02.md").is_file():
            found.add(FINDING_PARTE)
            found.add(FINDING_LACUNA)

    if re.search(r"PAGINA_IMAGEM", imagem) and re.search(r"OCR:\s*false", imagem, re.I):
        found.add(FINDING_IMAGEM)

    doc_headers = re.findall(r"^## Documento\s+\S+", inteiro, re.M)
    if len(doc_headers) >= 2:
        found.add(FINDING_EXPORT)

    return found


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: lume_leitura_runtime.py <fixtures/n101-dir>", file=sys.stderr)
        sys.exit(2)
    fixdir = pathlib.Path(sys.argv[1])
    for tag in sorted(audit(fixdir)):
        print(tag)


if __name__ == "__main__":
    main()
