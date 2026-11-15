#!/usr/bin/env python3
"""Ground-truth audit of synthetic minuta fixtures (no skill text)."""
from __future__ import annotations

import pathlib
import re
import sys

FINDING_DISPOSITIVO = "dispositivo_incoerente"
FINDING_PEDIDO = "pedido_sem_resposta"
FINDING_DATA = "data_incompativel"
FINDING_VALOR = "valor_divergente"


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def audit(pecas: str, minuta: str) -> set[str]:
    found: set[str] = set()
    pecas_l = pecas.lower()
    minuta_l = minuta.lower()

    fund_proc = bool(re.search(r"proceden", minuta_l)) and "fundamentação" in minuta_l
    disp_impr = bool(re.search(r"improceden", minuta_l)) and "dispositivo" in minuta_l
    if fund_proc and disp_impr:
        found.add(FINDING_DISPOSITIVO)

    if re.search(r"pedido autônomo.*dib", pecas_l) and re.search(
        r"não enfrento o pedido autônomo|não enfrento.*dib",
        minuta_l,
    ):
        found.add(FINDING_PEDIDO)

    if re.search(r"12/03/2024", pecas) and re.search(r"12/04/2024", minuta):
        found.add(FINDING_DATA)

    m_peca = re.search(r"R\$\s*1[\.,]000", pecas)
    m_min = re.search(r"R\$\s*100[,\.]00", minuta)
    if m_peca and m_min:
        found.add(FINDING_VALOR)

    return found


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: lume_revisao_runtime.py <pecas.md> <minuta.md>", file=sys.stderr)
        sys.exit(2)
    pecas = read(pathlib.Path(sys.argv[1]))
    minuta = read(pathlib.Path(sys.argv[2]))
    for tag in sorted(audit(pecas, minuta)):
        print(tag)


if __name__ == "__main__":
    main()
