#!/usr/bin/env python3
"""Ground-truth audit of the synthetic N103 case (relatorio, pause, Voto-Ementa). Reads fixtures only."""
from __future__ import annotations

import pathlib
import re
import sys

CASE = "lume-runtime-relvoto-10"
HEADINGS = ["1", "1.1", "1.2", "2", "2.1", "2.2", "2.3", "3"]
DISCLAIMER = re.compile(r"inteligência artificial|\bIA\b|revis[ãa]o humana|Res\. ?CNJ|isen[çc][ãa]o|n[ãa]o substitui", re.I)
RECOMMEND = re.compile(r"recomend|sugiro|melhor op[çc][ãa]o|entendo que", re.I)
ROMAN = re.compile(r"^\s*#*\s*[IVX]+\s*[-.)]\s", re.M)


def read(p: pathlib.Path) -> str:
    return p.read_text(encoding="utf-8") if p.is_file() else ""


def kv(text: str) -> dict[str, str]:
    return {m.group(1): m.group(2).strip() for m in re.finditer(r"^([A-Z_]+):\s*(.+)$", text, re.M)}


def decide(msg: str) -> str:
    """Reference host reply state for a user message sent at the Posicao pause."""
    m = msg.strip()
    if re.fullmatch(r"4\s*\.?", m):
        return "PEDE_POSICAO"
    if re.fullmatch(r"[123]\s*\.?", m):
        return "VOTO"
    if re.fullmatch(r"pode seguir\s*[.!]?", m, re.I):  # D2: delegates the outcome, only at this prompt
        return "VOTO"
    if len(m.split()) >= 4 and re.search(r"provimento|procedente|improcedente|acolh|rejeit", m, re.I):
        return "VOTO"
    return "PAUSA"


def relatorio_ok(rel: str, man: dict[str, str]) -> set[str]:
    found: set[str] = set()
    head = rel.split("Posição a ser adotada", 1)[0]
    seen = [m.group(1) for m in re.finditer(r"^(\d(?:\.\d)?)\.\s+\S", head + "3. x", re.M)]
    if seen == HEADINGS:
        found.add("relatorio_hierarquia")
    tail = rel.split("Posição a ser adotada", 1)[1] if "Posição a ser adotada" in rel else ""
    opts = re.findall(r"^[1-4]\. ", tail, re.M)
    if len(opts) == 4 and tail.rstrip().endswith("acórdão.") and not RECOMMEND.search(tail):
        found.add("posicao_quatro_opcoes")
    laudo = "Há laudo" if man.get("LAUDO_PERICIAL") == "sim" else "Não há laudo"
    if laudo in tail:
        found.add("laudo_linha_coerente")
    if not re.search(r"^\*\*|^[A-ZÀ-Ý .,;:-]{25,}$", tail, re.M) and "Dispositivo" not in tail:
        found.add("pausa_sem_voto")
    names = [man.get("RECORRENTE", ""), man.get("RECORRIDO", "")]
    if all(n and n in rel for n in names) and not re.search(r"\b[A-Z]\.\s?[A-Z]\.", rel):
        found.add("nomes_completos")
    if not DISCLAIMER.search(rel):
        found.add("sem_ressalva")
    return found


def voto_ok(voto: str, man: dict[str, str]) -> set[str]:
    found: set[str] = set()
    paras = [p.strip() for p in voto.strip().split("\n\n") if p.strip()]
    if not paras:
        return found
    ementa, body = paras[0], paras[1:]
    ok = bool(re.fullmatch(r"\*\*[^a-zà-ÿ*]+\*\*", ementa))
    ok &= "VOTO-EMENTA" not in voto.upper().replace("VOTO-EMENTA", "VOTO-EMENTA") or "VOTO-EMENTA" not in voto
    ok &= not ROMAN.search(voto)
    nums = [re.match(r"\*\*(\d+)\.\*\* \S", p) for p in body]
    ok &= all(nums) and [int(m.group(1)) for m in nums if m] == list(range(1, len(body) + 1))
    ok &= all("**" not in re.sub(r"^\*\*\d+\.\*\*", "", p) for p in body)
    ok &= ";" not in voto and not re.search(r"^\s*([-*]|\d+\.)\s", voto, re.M)
    disp = [i for i, p in enumerate(body) if re.search(r"provimento", p)]
    hon = [i for i, p in enumerate(body) if re.search(r"honor[áa]rios", p)]
    ok &= bool(disp and hon and not set(disp) & set(hon))
    ok &= all(n in voto for n in (man.get("RECORRENTE", "x"), man.get("RECORRIDO", "x")))
    ok &= not DISCLAIMER.search(voto)
    if ok:
        found.add("voto_ementa_forma")
    if re.search(r"nega-se provimento|negar provimento|nega provimento", voto, re.I):
        found.add("voto_segue_posicao")
    return found


def turnos_ok(text: str) -> set[str]:
    found: set[str] = set()
    rows = [ln.split("|") for ln in text.splitlines() if ln.strip() and not ln.startswith("#")]
    got = {r[0]: (decide(r[1]), r[2].strip()) for r in rows if len(r) == 3}
    if got.get("T1", ("", ""))[0] == "PAUSA" == got["T1"][1]:
        found.add("pausa_apos_relatorio")
    if got.get("T2") and got["T2"][0] == got["T2"][1] == "VOTO":
        found.add("pode_seguir_delega")
    if got.get("T5") and got["T5"][0] == got["T5"][1] == "PAUSA":
        found.add("nao_escolha_mantem_pausa")
    if got.get("T3") and got["T3"][0] == got["T3"][1] == "PEDE_POSICAO":
        found.add("quatro_pede_posicao")
    if got.get("T4") and got["T4"][0] == got["T4"][1] == "VOTO":
        found.add("escolha_libera_voto")
    return found


def audit(fx: pathlib.Path) -> set[str]:
    man = kv(read(fx / f"{CASE}-manifest.md"))
    found = relatorio_ok(read(fx / f"{CASE}-relatorio.md"), man)
    found |= voto_ok(read(fx / f"{CASE}-voto.md"), man)
    found |= turnos_ok(read(fx / f"{CASE}-turnos.txt"))
    n = len(re.findall(r"^VOTO:", read(fx / f"{CASE}-votos-estilo.txt"), re.M))
    if n < 3:
        found.add("perfil_neutro_menos_de_tres")
    elif n <= 6:
        found.add("perfil_de_tres_a_seis")
    return found


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: lume_relvoto_runtime.py <fixtures/n103-dir>", file=sys.stderr)
        sys.exit(2)
    for tag in sorted(audit(pathlib.Path(sys.argv[1]))):
        print(tag)


if __name__ == "__main__":
    main()
