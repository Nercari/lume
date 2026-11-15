#!/usr/bin/env python3
"""Count hard JEF doc gaps on made-up cases H201–H206 plus climb-2/3 guards."""
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
LINT = HERE / "scripts/lint_lume_plugin.py"
HARD_IDS = ("H201", "H202", "H203", "H204", "H205", "H206")


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
    for prefix in (f"{label.upper()}:", "OPEN:", "DAILY:", "VIOLATIONS:"):
        m = re.search(rf"{re.escape(prefix)}\s*(\d+)", blob)
        if m:
            n = int(m.group(1))
            if n:
                return [f"GUARD:{label}:{n}"]
            return []
    return [f"GUARD:{label}:check-error"]


def cenarios_present() -> list[str]:
    text = read("skills/jef-revisao/references/cenarios.md")
    return [f"C-registro-ausente:{hid}" for hid in HARD_IDS if hid not in text]


def hard_open() -> list[str]:
    open_ids: list[str] = []
    triagem = read("skills/jef-triagem/SKILL.md")
    materias = read("skills/jef-materias/SKILL.md")
    relatorio = read("skills/jef-relatorio/SKILL.md")
    voto = read("skills/jef-voto/SKILL.md")
    pacote = read("skills/jef-pacote/SKILL.md")
    director = read("skills/jef-director/SKILL.md")

    # H201 — valor da causa acima do teto JEF / competência
    h201 = (
        re.search(r"valor da causa", triagem, re.I)
        and re.search(r"competên", triagem, re.I)
        and re.search(r"Juizados Especiais|teto|limite", triagem, re.I)
    )
    if not h201:
        open_ids.append("H201")

    # H202 — prescrição ou decadência suscitada pelo INSS
    h202 = (
        re.search(r"prescri|decadên", materias, re.I)
        and re.search(r"INSS", materias)
        and re.search(r"não ignore|enfrent", materias, re.I)
    )
    if not h202:
        open_ids.append("H202")

    # H203 — mais de um autor ou pedido com desfechos distintos
    h203 = (
        re.search(r"pedido", relatorio, re.I)
        and re.search(r"desfecho|resultado", relatorio, re.I)
        and re.search(r"pedido|autor", voto, re.I)
        and re.search(r"separad|distint|autônom", relatorio + voto, re.I)
    )
    if not h203:
        open_ids.append("H203")

    # H204 — tutela de urgência no recurso (não só em lote)
    h204 = (
        re.search(r"tutela de urg", triagem, re.I)
        and re.search(r"recurso", triagem, re.I)
        and re.search(r"não confund|sem mistur|mérito", triagem, re.I)
    )
    if not h204:
        open_ids.append("H204")

    # H205 — contradição entre peças (datas, DIB, valores)
    h205 = (
        re.search(r"contradit|CONTRADIT", triagem, re.I)
        and re.search(r"DIB|data|valor", triagem, re.I)
        and re.search(r"não harmon|sem presum|não invent", triagem, re.I)
    )
    if not h205:
        open_ids.append("H205")

    # H206 — peça indispensável ausente: nomear a falta
    h206 = (
        re.search(r"indispens|impede|crític", pacote + director, re.I)
        and re.search(r"falta|lacuna|ausente", pacote, re.I)
        and re.search(r"antes do produto|antes da minuta|antes do relatório", pacote + director, re.I)
        and re.search(r"não invent", director, re.I)
    )
    if not h206:
        open_ids.append("H206")

    return open_ids


def all_open() -> list[str]:
    items: list[str] = []
    if os.environ.get("LUME_HARD_PLANT") == "1":
        items.append("PLANT:test-hard")
    items.extend(run_guard(COUNT_OPEN, "open"))
    items.extend(run_guard(COUNT_DAILY, "daily"))
    items.extend(run_guard(LINT, "lint"))
    items.extend(cenarios_present())
    items.extend(hard_open())
    return items


def main() -> None:
    items = all_open()
    print(f"HARD: {len(items)}")
    for item in items:
        print(item)


if __name__ == "__main__":
    main()
