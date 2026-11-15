#!/usr/bin/env python3
"""Lint Lume plugin: Pedro standing rules, Fable apply-now gaps, contradictions, check_v3 FAILS."""
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
CHECK_V3 = pathlib.Path(__file__).resolve().parent.parent / (
    "reports/lume-plugin-v3-fable-2026-11-11/check_v3.py"
)

EXEMPT_ENGLISH = {
    "LICENSE",
    "contrato.md",
    "c0.md",
    "c1.md",
    "c2.md",
    "c3.md",
    "c4.md",
    "c5.md",
    "c6.md",
    "c7.md",
    "c8.md",
    "jef-v1.md",
    "fonte.md",
    "instrucoes.md",
}

DISCLAIMER_RX = re.compile(
    r"(Res\.?\s*CNJ\s*615|CNJ\s*615/2025|revisão humana|responsabilidade do magistrado|"
    r"ferramenta de IA|inteligência artificial.{0,40}(aviso|nota|isenção)|"
    r"conferência humana.{0,30}(obrigat|rascunho de apoio))",
    re.I,
)

CHILD_SKILLS = [
    s
    for s in (
        "jef-estilo",
        "jef-inicio",
        "jef-lote",
        "jef-materias",
        "jef-pacote",
        "jef-pesquisa",
        "jef-relatorio",
        "jef-revisao",
        "jef-triagem",
        "jef-voto",
        "jef-work",
    )
]

EXPECTED_STARTERS = [
    "Monte o relatório e a minuta de voto deste processo",
    "Faça a triagem deste lote de processos",
    "Revise esta minuta antes de eu assinar",
]

DIRECTOR_READ = (
    "Se `skills/jef-director/SKILL.md` ainda não foi lido nesta conversa, "
    "leia-o e siga-o primeiro, inclusive a leitura obrigatória."
)


def read_text(p: pathlib.Path) -> str:
    return p.read_text(encoding="utf-8")


def word_count_pt(text: str) -> int:
    return len(re.findall(r"\S+", text))


def violations() -> list[str]:
    v: list[str] = []
    texts = {
        p: read_text(p)
        for p in ROOT.rglob("*")
        if p.is_file() and p.suffix in {".md", ".json"} or p.name == "LICENSE"
    }

    if os.environ.get("LUME_LINT_PLANT") == "1":
        v.append("PLANT:test violation")

    dir_skill = texts.get(ROOT / "skills/jef-director/SKILL.md", "")
    diretor = texts.get(ROOT / "skills/jef-director/references/diretor.md", "")
    c2 = texts.get(ROOT / "skills/jef-director/references/c2.md", "")
    c7 = texts.get(ROOT / "skills/jef-materias/references/c7.md", "")
    pj = texts.get(ROOT / MANIFEST, "")

    # --- Pedro standing rules ---
    for p, t in texts.items():
        if p.name in EXEMPT_ENGLISH or "references/contrato" in str(p):
            continue
        if "Não inclua avisos" in t and p.name == "SKILL.md" and "jef-director" in str(p):
            continue
        for m in DISCLAIMER_RX.finditer(t):
            line = t[: m.start()].count("\n") + 1
            v.append(f"P-disclaimer:{p.relative_to(ROOT)}:{line}")

    wc = word_count_pt(diretor)
    if wc > 430:
        v.append(f"P-diretor-length:{wc}>430")

    if "Posição a ser adotada" not in dir_skill or "Posição a ser adotada" not in diretor:
        v.append("P-posicao-ausente")

    if not re.search(r"3 a 6 votos", texts.get(ROOT / "skills/jef-estilo/SKILL.md", "")):
        v.append("P-estilo-intervalo")

    lote = texts.get(ROOT / "skills/jef-lote/SKILL.md", "")
    if not re.search(r"prioridade legal ou tutela", lote) or not re.search(r"matéria", lote):
        v.append("P-lote-ordem")

    if not re.search(r"menor(es)?\s+não|não\s+abrevie\s+menor", c2, re.I):
        v.append("P-menores-regra")

    if "Use o nome completo das partes" not in dir_skill:
        v.append("P-nome-completo")

    try:
        manifest = json.loads(pj)
        starters = manifest["extensions"]["com.openai"]["interface"]["defaultPrompt"]
        if starters != EXPECTED_STARTERS:
            v.append("P-starters-alterados")
    except (KeyError, json.JSONDecodeError, TypeError):
        v.append("P-starters-parse")

    for rel in dict.fromkeys([MANIFEST, ".codex-plugin/plugin.json"]):
        try:
            d = json.loads(texts.get(ROOT / rel, "{}"))
            if d.get("version") != VERSION:
                v.append(f"P-version:{rel}")
        except json.JSONDecodeError:
            v.append(f"P-version-json:{rel}")

    for p, t in texts.items():
        if p.suffix != ".md":
            continue
        if p.name in EXEMPT_ENGLISH:
            continue
        if "/references/" in str(p) and p.name not in {"diretor.md", "formato.md", "cenarios.md"}:
            if p.name in {
                "c0.md",
                "c1.md",
                "c2.md",
                "c3.md",
                "c4.md",
                "c5.md",
                "c6.md",
                "c7.md",
                "c8.md",
                "jef-v1.md",
                "contrato.md",
                "fonte.md",
                "instrucoes.md",
            }:
                continue
        eng = 0
        for line in t.splitlines():
            if len(re.findall(r"\b(the|and|must|shall|when|with|this)\b", line, re.I)) >= 4:
                eng += 1
        if eng >= 8:
            v.append(f"P-ingles:{p.relative_to(ROOT)}")

    # --- Fable apply-now still open ---
    for skill in CHILD_SKILLS:
        sp = ROOT / "skills" / skill / "SKILL.md"
        if not sp.exists():
            continue
        body = texts.get(sp, "")
        if skill in {"jef-estilo", "jef-work"}:
            if "Aplique as regras comuns" in body and DIRECTOR_READ not in body:
                v.append(f"F-child-director:{skill}")
        elif DIRECTOR_READ not in body and skill != "jef-inicio":
            v.append(f"F-child-director:{skill}")

    revisao = texts.get(ROOT / "skills/jef-revisao/SKILL.md", "")
    if "tabela com trecho, problema" not in revisao:
        v.append("F-revisao-forma")

    if "motor de cálculo do plugin" in c7:
        v.append("F-c7-motor-calculo")

    long_desc = ""
    try:
        long_desc = json.loads(pj)["extensions"]["com.openai"]["interface"]["longDescription"]
    except (KeyError, json.JSONDecodeError):
        pass
    if "sem vínculo com o CNJ" not in long_desc and "sem vinculo com o CNJ" not in long_desc:
        v.append("F-manifest-independencia")

    # --- internal contradictions ---
    no_calc = "não tem calculadora" in dir_skill or "não tem calculadora" in diretor
    if no_calc and re.search(r"motor de cálculo do plugin", c7):
        v.append("C-calculadora-c7-vs-director")

    triagem = texts.get(ROOT / "skills/jef-triagem/SKILL.md", "")
    if ("prioridade legal ou tutela" in lote) != ("prioridade legal ou tutela" in triagem):
        v.append("C-lote-triagem-ordem")

    cenarios = texts.get(ROOT / "skills/jef-revisao/references/cenarios.md", "")
    for tag in ("T80", "T102", "T108"):
        if tag not in cenarios:
            v.append(f"C-cenario-ausente:{tag}")

    # --- check_v3 ---
    if CHECK_V3.is_file():
        out = subprocess.run(
            [sys.executable, str(CHECK_V3), str(ROOT), VERSION],
            capture_output=True,
            text=True,
            check=False,
        )
        blob = out.stdout + out.stderr
        m = re.search(r"FAILS:\s*(.+)", blob)
        if m:
            tail = m.group(1).strip()
            if tail != "none" and tail != "[]":
                for part in re.split(r",\s*", tail.strip("[]")):
                    part = part.strip().strip("'\"")
                    if part:
                        v.append(f"V3:{part}")

    return v


def main() -> None:
    v = violations()
    print(f"VIOLATIONS: {len(v)}")
    for item in v:
        print(item)


if __name__ == "__main__":
    main()
