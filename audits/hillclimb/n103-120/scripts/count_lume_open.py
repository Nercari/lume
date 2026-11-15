#!/usr/bin/env python3
"""Count open Fable apply-now rows, workflow doc gaps (made-up cases), and check_v3 FAILS."""
from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
MANIFEST = next((m for m in ("plugin.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json")
                 if (ROOT / m).is_file()), "plugin.json")
if len(sys.argv) > 2:
    VERSION = sys.argv[2]
else:
    VERSION = json.loads((ROOT / MANIFEST).read_text(encoding="utf-8"))["version"]
HERE = pathlib.Path(__file__).resolve().parent.parent
CHECK_V3 = HERE / "reports/lume-plugin-v3-fable-2026-11-11/check_v3.py"
CENARIOS = ROOT / "skills/jef-revisao/references/cenarios.md"

WORKFLOW_IDS = ("W109", "W110", "W111", "W112")


def read(rel: str) -> str:
    p = ROOT / rel
    return p.read_text(encoding="utf-8") if p.is_file() else ""


def fable_open() -> list[str]:
    """Fable apply-now rows 1,3–9,11–17 (rows 2 and 10 conflict with Pedro: not counted)."""
    open_ids: list[str] = []
    diretor = read("skills/jef-director/references/diretor.md")
    dir_skill = read("skills/jef-director/SKILL.md")
    lote = read("skills/jef-lote/SKILL.md")
    pesquisa = read("skills/jef-pesquisa/SKILL.md")
    revisao = read("skills/jef-revisao/SKILL.md")
    estilo = read("skills/jef-estilo/SKILL.md")
    inicio = read("skills/jef-inicio/SKILL.md")
    triagem = read("skills/jef-triagem/SKILL.md")
    formato = read("skills/jef-pacote/references/formato.md")
    c6 = read("skills/jef-voto/references/c6.md")
    c7 = read("skills/jef-materias/references/c7.md")
    pj = json.loads(read(MANIFEST) or "{}")
    codex = json.loads(read(".codex-plugin/plugin.json") or "{}")
    lic = read("LICENSE")

    if re.search(r"\bhash\b", diretor, re.I) or "quinto link" in c6:
        open_ids.append("F01")
    if "tabela com trecho, problema" not in revisao:
        open_ids.append("F03")
    if "tabela de triagem" not in lote or "prioridade legal ou tutela" not in lote:
        open_ids.append("F04")
    if "Súmulas:" not in pesquisa or "busca na web não estiver disponível" not in pesquisa:
        open_ids.append("F05")
    if re.search(r"custom gpt|task.observer|grill-with", diretor, re.I) or len(
        re.findall(r"\S+", diretor)
    ) > 430:
        open_ids.append("F06")
    if "final-vote-drafter" not in dir_skill or "Não procure essas skills" not in dir_skill:
        open_ids.append("F07")
    if "seções 1 a 14" not in dir_skill or "seção 17" not in dir_skill:
        open_ids.append("F08")
    if "perfil-estilo.md" not in estilo or "Project do ChatGPT" not in estilo:
        open_ids.append("F09")
    if "Para começar, cole ou anexe" not in inicio or "3 a 6 votos" not in inicio:
        open_ids.append("F11")
    if "Não peça CPF" not in dir_skill:
        open_ids.append("F12")
    if "Pedro Neres" not in lic:
        open_ids.append("F13")
    if "não tem calculadora" not in dir_skill or "motor de cálculo do plugin" in c7:
        open_ids.append("F14")
    if "Coordena triagem" not in dir_skill or "sem redigir minuta" not in triagem:
        open_ids.append("F15")
    if "lume-caso-parte" not in formato or "pje+r" in formato.lower():
        open_ids.append("F16")
    if "última edição da" in c6:
        open_ids.append("F17")

    long_desc = (
        pj.get("extensions", {})
        .get("com.openai", {})
        .get("interface", {})
        .get("longDescription", "")
    )
    if "sem vínculo com o CNJ" not in long_desc:
        open_ids.append("F12b")
    release = (
        pj.get("extensions", {})
        .get("com.openai", {})
        .get("publication", {})
        .get("release_notes", "")
    )
    if pj.get("version") != codex.get("version"):
        open_ids.append("F13b")

    if not release.strip():
        open_ids.append("F13c")

    return open_ids


def workflow_open() -> list[str]:
    open_ids: list[str] = []
    cenarios = read("skills/jef-revisao/references/cenarios.md")
    for wid in WORKFLOW_IDS:
        if wid not in cenarios:
            open_ids.append(f"C-registro-ausente:{wid}")

    inicio = read("skills/jef-inicio/SKILL.md")
    dir_skill = read("skills/jef-director/SKILL.md")
    lote = read("skills/jef-lote/SKILL.md")
    estilo = read("skills/jef-estilo/SKILL.md")

    combo = (
        re.search(
            r"relatório e a minuta|relatório e minuta",
            inicio,
            re.I,
        )
        and re.search(r"Posição a ser adotada", inicio)
        and re.search(
            r"relatório e a minuta|relatório e minuta",
            dir_skill,
            re.I,
        )
    )
    if not combo:
        open_ids.append("W109")

  # Tabela final já na ordem D2 antes de iniciar próxima leva
    if not re.search(
        r"tabela.{0,80}(ordenad|prioridade legal ou tutela)",
        lote,
        re.I | re.S,
    ):
        open_ids.append("W110")

    if not re.search(r"JEF-V1", estilo) or not re.search(
        r"Fora desse intervalo", estilo
    ):
        open_ids.append("W111")

    triagem = read("skills/jef-triagem/SKILL.md")
    if "nome completo" not in triagem or "segredo de justiça" not in triagem:
        open_ids.append("W112")

    return open_ids


def check_v3_open() -> list[str]:
    if not CHECK_V3.is_file():
        return []
    out = subprocess.run(
        [sys.executable, str(CHECK_V3), str(ROOT), VERSION],
        capture_output=True,
        text=True,
        check=False,
    )
    blob = out.stdout + out.stderr
    m = re.search(r"FAILS:\s*(.+)", blob)
    if not m:
        return ["V3:check-error"]
    tail = m.group(1).strip()
    if tail in ("none", "[]"):
        return []
    return [
        f"V3:{part.strip()}"
        for part in re.split(r",\s*", tail.strip("[]"))
        if part.strip()
    ]


def all_open() -> list[str]:
    items: list[str] = []
    if os.environ.get("LUME_OPEN_PLANT") == "1":
        items.append("PLANT:test-open")
    items.extend(fable_open())
    items.extend(workflow_open())
    items.extend(check_v3_open())
    return items


def main() -> None:
    items = all_open()
    print(f"OPEN: {len(items)}")
    for item in items:
        print(item)


if __name__ == "__main__":
    main()
