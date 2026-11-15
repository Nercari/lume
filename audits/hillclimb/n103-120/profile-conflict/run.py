#!/usr/bin/env python3
"""Profile-ending vs D1 menu. Builds one prompt from the BUILT plugin (plugins/lume-claude of --root),
runs it through local `claude -p` (no tools, no session, no MCP), and classifies the relatório ending.
usage: run.py --root <repo> [--runs N] [--model sonnet] [--no-profile]"""
import argparse, pathlib, re, subprocess, sys
ap = argparse.ArgumentParser(); ap.add_argument("--root", required=True); ap.add_argument("--runs", type=int, default=3)
ap.add_argument("--model", default="sonnet"); ap.add_argument("--no-profile", action="store_true"); a = ap.parse_args()
H = pathlib.Path(__file__).resolve().parent
sk = pathlib.Path(a.root) / "plugins/lume-claude/skills"
parts = ["jef-director/SKILL.md", "jef-director/references/contrato.md", "jef-director/references/profiles.md",
         "jef-relatorio/SKILL.md", "jef-relatorio/references/c4.md"]
rules = "\n\n".join(f"=== {p} ===\n{(sk / p).read_text(encoding='utf-8')}" for p in parts)
fx = H.parent / "scripts/fixtures/n103/lume-runtime-relvoto-10-manifest.md"
profile = "" if a.no_profile else f"\n\n=== perfil-estilo.md (perfil ativo do usuário) ===\n{(H / 'perfil-estilo.md').read_text(encoding='utf-8')}"
system = "Você executa as regras do plugin Lume abaixo. Responda como o plugin responderia ao usuário.\n\n" + rules + profile
user = "Faça o relatório e a minuta do recurso, sem orientação sobre o resultado.\n\nAutos (sintéticos):\n" + fx.read_text(encoding="utf-8")
res = []
for i in range(a.runs):
    out = subprocess.run(["claude", "-p", "--model", a.model, "--tools", "", "--no-session-persistence", "--strict-mcp-config",
                          "--setting-sources", "", "--system-prompt", system, user], capture_output=True, text=True, cwd=H, timeout=600)
    t = out.stdout
    (H / f"out-{'control' if a.no_profile else 'profile'}-{i + 1}.md").write_text(t, encoding="utf-8")
    tail = t.split("Posição a ser adotada", 1)[1] if "Posição a ser adotada" in t else ""
    menu = len(re.findall(r"^\s*[1-4][.)]\s", tail, re.M)) == 4
    free = "Como deseja decidir este recurso?" in t
    voto = bool(re.search(r"VOTO|EMENTA|ACORDAM", t)) 
    res.append((menu, free, voto, out.returncode))
    print(f"run {i + 1}: menu_4_options={menu} profile_sentence={free} voto_drafted={voto} rc={out.returncode}")
