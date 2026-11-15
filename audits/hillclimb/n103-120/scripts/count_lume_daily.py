#!/usr/bin/env python3
"""Count daily-workflow doc gaps on made-up cases (D101–D106) plus climb-2 guards."""
from __future__ import annotations

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
HERE = pathlib.Path(__file__).resolve().parent.parent
COUNT_OPEN = HERE / "scripts/count_lume_open.py"
LINT = HERE / "scripts/lint_lume_plugin.py"
CENARIOS = ROOT / "skills/jef-revisao/references/cenarios.md"

DAILY_IDS = ("D101", "D102", "D103", "D104", "D105", "D106")


def read(rel: str) -> str:
    p = ROOT / rel
    return p.read_text(encoding="utf-8") if p.is_file() else ""


def run_guard(script: pathlib.Path, label: str) -> list[str]:
    out = subprocess.run(
        [sys.executable, str(script), str(ROOT)],
        capture_output=True,
        text=True,
        check=False,
    )
    blob = out.stdout + out.stderr
    m = re.search(r"(?:OPEN|VIOLATIONS):\s*(\d+)", blob)
    if not m:
        return [f"GUARD:{label}:check-error"]
    n = int(m.group(1))
    if n:
        return [f"GUARD:{label}:{n}"]
    return []


def cenarios_present() -> list[str]:
    text = read("skills/jef-revisao/references/cenarios.md")
    open_ids: list[str] = []
    for did in DAILY_IDS:
        if did not in text:
            open_ids.append(f"C-registro-ausente:{did}")
    return open_ids


def daily_open() -> list[str]:
    open_ids: list[str] = []
    pacote = read("skills/jef-pacote/SKILL.md")
    director = read("skills/jef-director/SKILL.md")
    triagem = read("skills/jef-triagem/SKILL.md")
    work = read("skills/jef-work/SKILL.md")
    lote = read("skills/jef-lote/SKILL.md")
    inicio = read("skills/jef-inicio/SKILL.md")
    relatorio = read("skills/jef-relatorio/SKILL.md")
    voto = read("skills/jef-voto/SKILL.md")
    pesquisa = read("skills/jef-pesquisa/SKILL.md")
    estilo = read("skills/jef-estilo/SKILL.md")
    revisao = read("skills/jef-revisao/SKILL.md")

    # D101 — ler peças coladas/anexadas (caso fictício com parte ausente)
    d101 = (
        "lume-caso-parte" in pacote
        and re.search(r"lacunas|faltar parte", pacote, re.I)
        and "jef-pacote" in director
        and "jef-pacote" in triagem
        and "jef-pacote" in work
    )
    if not d101:
        open_ids.append("D101")

    # D102 — triagem e ordenação de lote fictício sem critério
    if not re.search(
        r"tabela.{0,80}(ordenad|prioridade legal ou tutela)",
        lote,
        re.I | re.S,
    ):
        open_ids.append("D102")

    # D103 — relatório e minuta em caso fictício sem orientação fixada
    combo = (
        re.search(r"relatório e a minuta|relatório e minuta", inicio, re.I)
        and re.search(r"Posição a ser adotada", inicio)
        and re.search(r"relatório e a minuta|relatório e minuta", director, re.I)
        and re.search(r"Posição a ser adotada", relatorio)
        and re.search(r"Posição a ser adotada", voto)
    )
    if not combo:
        open_ids.append("D103")

    # D104 — pesquisa/súmulas em caso fictício sem verificação disponível
    d104 = (
        "Súmulas:" in pesquisa
        and "busca na web não estiver disponível" in pesquisa
        and re.search(r"não cite de memória como conferido", pesquisa, re.I)
        and re.search(r"não invente.*autoridad", director, re.I)
    )
    if not d104:
        open_ids.append("D104")

    # D105 — perfil de estilo com votos fictícios insuficientes
    if not (
        re.search(r"3 a 6 votos", estilo)
        and re.search(r"JEF-V1", estilo)
        and re.search(r"sem bloquear", estilo, re.I)
    ):
        open_ids.append("D105")

    # D106 — revisão pré-assinatura em minuta fictícia
    d106 = (
        "tabela com trecho, problema" in revisao
        and re.search(r"dispositivo.*fundamentação|fundamentação.*dispositivo", revisao, re.I | re.S)
        and re.search(r"pedido", revisao, re.I)
        and re.search(r"data", revisao, re.I)
        and re.search(r"valor", revisao, re.I)
    )
    if not d106:
        open_ids.append("D106")

    return open_ids


def all_open() -> list[str]:
    items: list[str] = []
    if os.environ.get("LUME_DAILY_PLANT") == "1":
        items.append("PLANT:test-daily")
    items.extend(run_guard(COUNT_OPEN, "open"))
    items.extend(run_guard(LINT, "lint"))
    items.extend(cenarios_present())
    items.extend(daily_open())
    return items


def main() -> None:
    items = all_open()
    print(f"DAILY: {len(items)}")
    for item in items:
        print(item)


if __name__ == "__main__":
    main()
