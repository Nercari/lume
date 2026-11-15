#!/usr/bin/env python3
"""North-star job coverage: N101–N106 on made-up cases; guards climb 2–4 at 0."""
from __future__ import annotations

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
HERE = pathlib.Path(__file__).resolve().parent.parent
COUNT_OPEN = HERE / "scripts/count_lume_open.py"
COUNT_DAILY = HERE / "scripts/count_lume_daily.py"
COUNT_HARD = HERE / "scripts/count_lume_hard.py"
LINT = HERE / "scripts/lint_lume_plugin.py"
NORTH_IDS = ("N101", "N102", "N103", "N104", "N105", "N106")


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
    for prefix in (f"{label.upper()}:", "OPEN:", "DAILY:", "HARD:", "VIOLATIONS:"):
        m = re.search(rf"{re.escape(prefix)}\s*(\d+)", blob)
        if m:
            n = int(m.group(1))
            if n:
                return [f"GUARD:{label}:{n}"]
            return []
    return [f"GUARD:{label}:check-error"]


def cenarios_present() -> list[str]:
    text = read("skills/jef-revisao/references/cenarios.md")
    return [f"C-registro-ausente:{nid}" for nid in NORTH_IDS if nid not in text]


def north_open() -> list[str]:
    open_ids: list[str] = []
    pacote = read("skills/jef-pacote/SKILL.md")
    triagem = read("skills/jef-triagem/SKILL.md")
    work = read("skills/jef-work/SKILL.md")
    lote = read("skills/jef-lote/SKILL.md")
    inicio = read("skills/jef-inicio/SKILL.md")
    director = read("skills/jef-director/SKILL.md")
    relatorio = read("skills/jef-relatorio/SKILL.md")
    voto = read("skills/jef-voto/SKILL.md")
    c4 = read("skills/jef-relatorio/references/c4.md")
    pesquisa = read("skills/jef-pesquisa/SKILL.md")
    c5 = read("skills/jef-pesquisa/references/c5.md")
    estilo = read("skills/jef-estilo/SKILL.md")
    revisao = read("skills/jef-revisao/SKILL.md")

    # N101 — ler peças coladas/anexadas (caso fictício com parte ausente e imagem)
    n101 = (
        "lume-caso-parte" in pacote
        and re.search(r"lacunas|faltar parte", pacote, re.I)
        and "jef-pacote" in triagem
        and "jef-pacote" in work
        and re.search(r"visão|lido por visão", pacote, re.I)
        and re.search(r"inteiro teor|## Documento", pacote)
    )
    if not n101:
        open_ids.append("N101")

    # N102 — triagem e ordenação de lote fictício (tutela primeiro, depois matéria)
    n102 = (
        re.search(r"tabela.{0,80}(ordenad|prioridade legal ou tutela)", lote, re.I | re.S)
        and re.search(r"matéria", lote)
        and re.search(r"CASE_STATE", lote)
        and re.search(r"matéria", triagem)
        and re.search(r"tutela", triagem, re.I)
    )
    if not n102:
        open_ids.append("N102")

    # N103 — relatório e voto em caso fictício sem orientação fixada
    n103 = (
        re.search(r"relatório e a minuta|relatório e minuta", inicio, re.I)
        and re.search(r"Posição a ser adotada", inicio)
        and re.search(r"relatório e a minuta|relatório e minuta", director, re.I)
        and re.search(r"Posição a ser adotada", relatorio)
        and re.search(r"Posição a ser adotada", voto)
        and re.search(r"Posição a ser adotada", c4)
        and re.search(r"sem voto|sem recomendar", relatorio, re.I)
    )
    if not n103:
        open_ids.append("N103")

    # N104 — jurisprudência e súmulas: só fonte conferida; não inventar número/enunciado
    n104 = (
        re.search(r"não cite de memória como conferido", pesquisa, re.I)
        and re.search(r"busca na web não estiver disponível", pesquisa)
        and re.search(
            r"não invent.*número.*súmula|súmula.*não invent|não confirme.*número|número.*sem confirmação",
            pesquisa,
            re.I | re.S,
        )
        and re.search(
            r"somente o que conferir|somente o que o usuário|peça|texto ou o link",
            pesquisa + c5,
            re.I,
        )
        and re.search(r"não invent.*autoridad", director, re.I)
    )
    if not n104:
        open_ids.append("N104")

    # N105 — perfil de estilo: extrair, aplicar na redação, menos de 3 votos → JEF-V1
    n105 = (
        re.search(r"3 a 6 votos", estilo)
        and re.search(r"estrutura.*ementa|ementa.*estrutura", estilo, re.I | re.S)
        and re.search(r"honorários", estilo)
        and re.search(r"perfil-estilo\.md", estilo)
        and re.search(
            r"perfil-estilo\.md|perfil de estilo",
            voto,
            re.I,
        )
        and re.search(
            r"aplic.*perfil-estilo|perfil-estilo\.md.*forma|forma.*perfil-estilo",
            estilo + voto + read("skills/jef-voto/references/c6.md"),
            re.I | re.S,
        )
        and re.search(r"menos de 3|1 ou 2|zero|0|1 voto|2 votos", estilo, re.I)
        and re.search(r"JEF-V1", estilo)
        and re.search(r"sem bloquear", estilo, re.I)
    )
    if not n105:
        open_ids.append("N105")

    # N106 — revisão pré-assinatura em minuta fictícia (dispositivo, pedidos, datas, valores)
    n106 = (
        "tabela com trecho, problema" in revisao
        and re.search(r"dispositivo.*fundamentação|fundamentação.*dispositivo", revisao, re.I | re.S)
        and re.search(r"pedido", revisao, re.I)
        and re.search(r"data", revisao, re.I)
        and re.search(r"valor", revisao, re.I)
        and "c8.md" in revisao
    )
    if not n106:
        open_ids.append("N106")

    return open_ids


def all_open() -> list[str]:
    items: list[str] = []
    if os.environ.get("LUME_NORTH_PLANT") == "1":
        items.append("PLANT:test-north")
    items.extend(run_guard(COUNT_OPEN, "open"))
    items.extend(run_guard(COUNT_DAILY, "daily"))
    items.extend(run_guard(COUNT_HARD, "hard"))
    items.extend(run_guard(LINT, "lint"))
    items.extend(cenarios_present())
    items.extend(north_open())
    return items


def main() -> None:
    items = all_open()
    print(f"NORTH: {len(items)}")
    for item in items:
        print(item)


if __name__ == "__main__":
    main()
