#!/usr/bin/env python3
"""End-to-end leva (5 fictitious cases): triage table order through pre-signing review."""
from __future__ import annotations

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
HERE = pathlib.Path(__file__).resolve().parent.parent
COUNT_NORTH = HERE / "scripts/count_lume_north.py"
COUNT_OPEN = HERE / "scripts/count_lume_open.py"
COUNT_DAILY = HERE / "scripts/count_lume_daily.py"
COUNT_HARD = HERE / "scripts/count_lume_hard.py"
LINT = HERE / "scripts/lint_lume_plugin.py"

# Made-up leva: five synthetic cases (previdência, BPC, rural, tutela, agravo interno)
E2E_IDS = ("E201", "E202", "E203", "E204", "E205", "E206", "E207", "E208")
NORTH_STEP_IDS = {
    "N101": ("NS101-a", "NS101-b", "NS101-c", "NS101-d"),
    "N102": ("NS102-a", "NS102-b", "NS102-c", "NS102-d"),
    "N103": ("NS103-a", "NS103-b", "NS103-c", "NS103-d"),
    "N104": ("NS104-a", "NS104-b", "NS104-c", "NS104-d"),
    "N105": ("NS105-a", "NS105-b", "NS105-c", "NS105-d", "NS105-e"),
    "N106": ("NS106-a", "NS106-b", "NS106-c", "NS106-d", "NS106-e"),
}


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
    for prefix in ("NORTH:", "OPEN:", "DAILY:", "HARD:", "VIOLATIONS:"):
        m = re.search(rf"{re.escape(prefix)}\s*(\d+)", blob)
        if m:
            n = int(m.group(1))
            if n:
                return [f"GUARD:{label}:{n}"]
            return []
    return [f"GUARD:{label}:check-error"]


def cenarios_has(tag: str) -> bool:
    return tag in read("skills/jef-revisao/references/cenarios.md")


def north_step_gaps() -> dict[str, list[str]]:
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
    c6 = read("skills/jef-voto/references/c6.md")
    revisao = read("skills/jef-revisao/SKILL.md")

    gaps: dict[str, list[str]] = {k: [] for k in NORTH_STEP_IDS}

    # N101 — peças fictícias com lacuna e imagem
    checks_n101 = {
        "NS101-a": "lume-caso-parte" in pacote and cenarios_has("NS101-a"),
        "NS101-b": bool(re.search(r"lacunas|faltar parte", pacote, re.I)),
        "NS101-c": bool(re.search(r"visão|lido por visão", pacote, re.I)),
        "NS101-d": bool(re.search(r"inteiro teor|## Documento", pacote)),
    }
    for k, ok in checks_n101.items():
        if not ok:
            gaps["N101"].append(k)

    checks_n102 = {
        "NS102-a": "CASE_STATE" in lote and cenarios_has("NS102-a"),
        "NS102-b": bool(re.search(r"tutela", lote, re.I)),
        "NS102-c": bool(re.search(r"matéria", lote)),
        "NS102-d": bool(re.search(r"fech.*tabela|fecha.*tabela|Feche a leva", lote, re.I)),
    }
    for k, ok in checks_n102.items():
        if not ok:
            gaps["N102"].append(k)

    checks_n103 = {
        "NS103-a": bool(re.search(r"Posição a ser adotada", inicio)),
        "NS103-b": bool(re.search(r"Posição a ser adotada", relatorio) and re.search(r"Posição a ser adotada", c4)),
        "NS103-c": bool(re.search(r"sem voto|sem recomendar", relatorio, re.I)),
        "NS103-d": cenarios_has("NS103-d"),
    }
    for k, ok in checks_n103.items():
        if not ok:
            gaps["N103"].append(k)

    checks_n104 = {
        "NS104-a": bool(re.search(r"não invent.*número.*súmula|número.*sem confirmação", pesquisa, re.I | re.S)),
        "NS104-b": "busca na web não estiver disponível" in pesquisa,
        "NS104-c": bool(re.search(r"somente o que conferir|texto ou o link", pesquisa + c5, re.I)),
        "NS104-d": cenarios_has("NS104-d"),
    }
    for k, ok in checks_n104.items():
        if not ok:
            gaps["N104"].append(k)

    checks_n105 = {
        "NS105-a": bool(re.search(r"3 a 6 votos", estilo)),
        "NS105-b": "perfil-estilo.md" in estilo,
        "NS105-c": bool(re.search(r"aplic.*perfil-estilo|perfil-estilo\.md", estilo + voto + c6, re.I | re.S)),
        "NS105-d": bool(re.search(r"menos de 3|JEF-V1", estilo, re.I)),
        "NS105-e": cenarios_has("NS105-e"),
    }
    for k, ok in checks_n105.items():
        if not ok:
            gaps["N105"].append(k)

    checks_n106 = {
        "NS106-a": "tabela com trecho, problema" in revisao,
        "NS106-b": bool(
            re.search(r"dispositivo.*fundamentação|fundamentação.*dispositivo", revisao, re.I | re.S)
        ),
        "NS106-c": bool(re.search(r"pedido", revisao, re.I) and re.search(r"data", revisao, re.I) and re.search(r"valor", revisao, re.I)),
        "NS106-d": bool(
            re.search(
                r"não declare.*pronta para assinar|não diga que.*pronta para assinar|achado material",
                revisao,
                re.I | re.S,
            )
        ),
        "NS106-e": cenarios_has("NS106-e"),
    }
    for k, ok in checks_n106.items():
        if not ok:
            gaps["N106"].append(k)

    return gaps


def e2e_open() -> list[str]:
    open_ids: list[str] = []
    lote = read("skills/jef-lote/SKILL.md")
    work = read("skills/jef-work/SKILL.md")
    director = read("skills/jef-director/SKILL.md")
    inicio = read("skills/jef-inicio/SKILL.md")
    revisao = read("skills/jef-revisao/SKILL.md")
    relatorio = read("skills/jef-relatorio/SKILL.md")
    voto = read("skills/jef-voto/SKILL.md")

    if not cenarios_has("E201"):
        open_ids.append("E201")
    if not (
        re.search(r"ordem da tabela|na ordem (?:da )?tabela|ordem da leva", lote + director + work, re.I)
    ):
        open_ids.append("E202")
    if not re.search(
        r"relatório.*Posição a ser adotada.*minuta|Posição a ser adotada.*depois.*minuta",
        lote + director,
        re.I | re.S,
    ):
        open_ids.append("E203")
    if not re.search(r"revisão.*antes de assinar|pré-assinatura", lote + director, re.I):
        open_ids.append("E204")
    if not re.search(r"cinco casos|cinco processos|leva de cinco", lote + work + inicio, re.I):
        open_ids.append("E205")
    if not cenarios_has("E206"):
        open_ids.append("E206")
    if not (
        cenarios_has("E207")
        and re.search(
            r"erro plantado|incoerência.*plantad|minuta fictícia.*dispositivo",
            revisao + read("skills/jef-revisao/references/c8.md"),
            re.I,
        )
    ):
        open_ids.append("E207")
    if not (
        re.search(r"CASE_STATE", lote)
        and re.search(r"não transfira|Não transfer", lote, re.I)
        and cenarios_has("E208")
    ):
        open_ids.append("E208")

    for eid in E2E_IDS:
        if eid in open_ids:
            continue
        if not cenarios_has(eid):
            open_ids.append(f"C-registro-ausente:{eid}")

    # Product chain per case after table
    if not re.search(
        r"após.*tabela|depois da tabela|tabela ordenada.*(?:em seguida|prosseguir|atender)",
        lote,
        re.I | re.S,
    ):
        if "E202" not in open_ids:
            open_ids.append("E202")

    if not re.search(r"jef-revisao", lote + work, re.I):
        if "E204" not in open_ids:
            open_ids.append("E204")

    if not (re.search(r"Posição a ser adotada", relatorio) and re.search(r"Posição a ser adotada", voto)):
        if "E203" not in open_ids:
            open_ids.append("E203")

    return sorted(set(open_ids))


def all_open() -> list[str]:
    items: list[str] = []
    if os.environ.get("LUME_E2E_PLANT") == "1":
        items.append("PLANT:test-e2e")
    items.extend(run_guard(COUNT_NORTH, "north"))
    items.extend(run_guard(COUNT_OPEN, "open"))
    items.extend(run_guard(COUNT_DAILY, "daily"))
    items.extend(run_guard(COUNT_HARD, "hard"))
    items.extend(run_guard(LINT, "lint"))
    for nid, miss in north_step_gaps().items():
        for step in miss:
            items.append(f"{nid}:{step}")
    items.extend(e2e_open())
    return items


def main() -> None:
    step_gaps = north_step_gaps()
    for nid in NORTH_STEP_IDS:
        n = len(step_gaps[nid])
        print(f"{nid}-steps: {n}")
    e2e = e2e_open()
    print(f"E2E: {len(e2e)}")
    for e in e2e:
        print(e)
    items = all_open()
    print(f"E2E_SCORE: {len(items)}")
    for item in items:
        print(item)


if __name__ == "__main__":
    main()
