// Builds plugins/lume-claude from plugins/lume-workspace. Skills, references and scripts are copied
// byte for byte, except for the explicit edits below. Every edit must match, or the build fails.
// Usage: node plugins/scripts/build-lume-claude.mjs [--check]   (--check: fail when the tree differs)
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SRC = path.join(pluginsDir, "lume-workspace");
export const OUT = path.join(pluginsDir, "lume-claude");

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? walk(abs, base) : [path.relative(base, abs).split(path.sep).join("/")];
  });
}

function replaceOnce(text, from, to, where) {
  if (text.split(from).length !== 2) throw new Error(`edit did not match exactly once: ${where}: ${from.slice(0, 60)}`);
  return text.replace(from, () => to);
}

// Chat target: claude.ai Chat copies only a skill's own folder into its code sandbox, and documents no
// ${CLAUDE_*} substitution there. So every skill folder is self-contained and uses SKILL.md-relative paths
// (references/x.md, scripts/y.py). Shared modules are copied into each skill folder that mentions them.
const rewritePaths = (text) =>
  text
    .replace(/(?<![\w/}.$-])skills\/jef-[a-z]+\/(references|scripts)\//g, "$1/")
    .replace(/(?<![\w/}.$-])skills\/(jef-[a-z]+)\/SKILL\.md/g, "skill `$1`");

const LOADING_OLD =
  "Use pacote/recurso do catálogo com skills.read ou caminho local fornecido pelo ambiente. Se não listado, consulte o catálogo na origem pertinente quando disponível. Em erro, confira a origem e tente caminho suportado já disponível; respeite negativa de acesso.";
const LOADING_NEW =
  "Este plugin roda no Claude (Chat, Cowork e Code). Cada skill traz na própria pasta os módulos de que precisa: leia `references/...` e rode `scripts/...` com caminhos relativos à pasta da skill em uso, onde está o SKILL.md. Carregue as demais skills pelo nome (`jef-pacote` e equivalentes). Em erro, confira o caminho e tente outra rota já disponível; respeite negativa de acesso.";
const LOAD_DIRECTOR_OLD = "Se `skills/jef-director/SKILL.md` ainda não foi lido nesta conversa, leia-o e siga-o primeiro";
const LOAD_DIRECTOR_NEW = "Se a skill `jef-director` ainda não foi carregada nesta conversa, carregue-a e siga-a primeiro";

// Label citations: "C5" means c5.md; "Leia o jef-director" and "contrato" mean contrato.md; "perfil" means profiles.md.
const citesByLabel = (name, text) => {
  const c = name.match(/^c([0-8])\.md$/);
  if (c) return new RegExp(`(?<![\\w-])C${c[1]}(?![\\w-])`).test(text);
  if (name === "contrato.md") return /contrato|jef-director/i.test(text);
  if (name === "profiles.md") return /perfil|perfis/i.test(text);
  return false;
};

// Copies each shared module into every skill folder whose files mention it by name, until nothing is missing.
function closeModules(files) {
  const modules = new Map(); // basename -> source rel path (basenames are unique across skills)
  for (const rel of files.keys()) {
    const m = rel.match(/^skills\/[^/]+\/((?:references|scripts)\/([^/]+))$/);
    if (m && !modules.has(m[2])) modules.set(m[2], rel);
    else if (m && modules.get(m[2]) !== rel && !files.get(rel).equals(files.get(modules.get(m[2])))) throw new Error(`module name clash: ${m[2]}`);
  }
  const skills = [...new Set([...files.keys()].map((r) => r.match(/^skills\/([^/]+)\//)?.[1]).filter(Boolean))];
  for (let changed = true; changed; ) {
    changed = false;
    for (const sk of skills) {
      const own = [...files.keys()].filter((r) => r.startsWith(`skills/${sk}/`) && /\.(md|py)$/.test(r));
      const text = own.map((r) => files.get(r).toString("utf8")).join("\n");
      for (const [name, from] of modules) {
        const to = `skills/${sk}/${from.split("/").slice(2).join("/")}`;
        if (files.has(to) || !(new RegExp(`(?<![\\w-])${name.replace(".", "\\.")}(?![\\w-])`).test(text) || citesByLabel(name, text))) continue;
        files.set(to, files.get(from));
        changed = true;
      }
    }
  }
}

export function build() {
  const files = new Map();
  for (const rel of walk(SRC)) {
    if (["plugin.json", ".codex-plugin/plugin.json", "LEIA-ME.md"].includes(rel) || rel.startsWith("assets/")) continue; // logo.png is re-added below as the listing icon
    files.set(rel, readFileSync(path.join(SRC, rel)));
  }
  const edit = (rel, fn) => files.set(rel, Buffer.from(fn(files.get(rel).toString("utf8"), rel)));
  edit("skills/jef-director/SKILL.md", (t, w) => replaceOnce(t, LOADING_OLD, LOADING_NEW, w));
  for (const rel of ["skills/jef-materias/SKILL.md", "skills/jef-triagem/SKILL.md"])
    edit(rel, (t, w) => replaceOnce(t, LOAD_DIRECTOR_OLD, LOAD_DIRECTOR_NEW, w));
  edit("skills/jef-materias/SKILL.md", (t, w) => replaceOnce(t, "siga `skills/jef-pesquisa/SKILL.md`", "siga a skill `jef-pesquisa`", w));
  edit("skills/jef-triagem/SKILL.md", (t, w) => replaceOnce(t, "conforme `skills/jef-pacote/SKILL.md`", "conforme a skill `jef-pacote`", w));
  edit("skills/jef-director/references/tools.md", (t, w) => {
    t = replaceOnce(
      t,
      "Resolver o diretório real desta skill via ambiente. Scripts ficam em `../scripts/` relativamente a esta referência.",
      "Scripts ficam em `scripts/`, relativo à pasta da skill que contém esta referência. Rodar os comandos a partir dessa pasta, com `python3`.",
      w,
    );
    t = t.replace(/`python (extract_pdf|lume_check)\.py/g, (_m, s) => `\`python3 scripts/${s}.py`);
    return replaceOnce(
      t,
      "## Extração\n",
      "## Extração\n\nAntes de extrair, confira o ambiente: `python3 -c \"import pypdf\"`, `which pdftoppm tesseract` e `tesseract --list-langs`. No Chat, o sandbox pode não ter essas ferramentas nem rede; se faltarem, não alegue extração: leia o PDF anexado diretamente (texto ou imagem) e registre a lacuna.\n",
      w,
    );
  });
  edit("skills/jef-director/references/profiles.md", (t, w) =>
    replaceOnce(
      t,
      "6. Sem conector de escrita,",
      "6. No Chat, sem conector de arquivos, o perfil vem de `perfil-estilo.md` anexado na conversa e o ajuste volta como arquivo para o usuário guardar; nada é salvo automaticamente. Sem conector de escrita,",
      w,
    ),
  );
  edit("skills/jef-voto/references/jef-v1.md", (t, w) =>
    replaceOnce(t, "`skills/jef-director/references/contrato.md`", "`references/contrato.md`", w),
  );
  edit("skills/jef-work/SKILL.md", (t, w) =>
    replaceOnce(t, "capacidades realmente disponíveis no Work", "capacidades realmente disponíveis no Claude", w),
  );
  for (const rel of files.keys()) if (/^skills\/[^/]+\/SKILL\.md$/.test(rel)) edit(rel, (t) => rewritePaths(t));
  closeModules(files);

  const src = JSON.parse(readFileSync(path.join(SRC, "plugin.json"), "utf8"));
  const manifest = {
    name: src.name,
    version: src.version,
    description: src.description,
    author: src.author,
    homepage: src.homepage,
    repository: src.repository,
    license: src.license,
    keywords: src.keywords,
  };
  files.set(".claude-plugin/icon.png", readFileSync(path.join(SRC, "assets/logo.png"))); // 512x512, under 2 MB
  files.set(".claude-plugin/plugin.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  files.set(
    "LEIA-ME.md",
    Buffer.from(`# Lume para Claude

Adaptação do plugin Lume (skills, sem MCP) para o Claude. Skills, referências e scripts vêm do plugin \`lume-workspace\` sem mudança, exceto o carregamento de módulos e os caminhos (veja \`plugins/scripts/build-lume-claude.mjs\`). Cada skill é autossuficiente: leva na própria pasta os módulos que cita, com caminhos relativos ao SKILL.md, sem variáveis \`\${CLAUDE_*}\`. Versão do manifesto: ${src.version}.

Uso: cole ou anexe as peças no chat e peça o produto: triagem, relatório, minuta, pesquisa ou revisão. Após o relatório, o Lume pergunta a posição a ser adotada e só então redige a minuta, salvo se o pedido já indicar a orientação. Para configurar o estilo, envie de 3 a 6 votos de sua autoria. Sem perfil, o Lume usa JEF-V1.

Testar sem instalar: \`claude --plugin-dir plugins/lume-claude\`. Skills: \`/lume:jef-director\`, \`/lume:jef-triagem\` e as demais.

Não usa servidor, MCP, hooks nem \`bin/\`. Os scripts de \`skills/jef-director/scripts/\` rodam localmente, sem rede; \`extract_pdf.py\` exige pypdf, e OCR exige pdftoppm e tesseract.
`),
  );
  return files;
}

function main() {
  const check = process.argv.includes("--check");
  const files = build();
  const onDisk = existsSync(OUT) ? new Set(walk(OUT)) : new Set();
  const diffs = [
    ...[...onDisk].filter((f) => !files.has(f)).map((f) => `extra: ${f}`),
    ...[...files].filter(([f, d]) => !onDisk.has(f) || !readFileSync(path.join(OUT, f)).equals(d)).map(([f]) => `differs: ${f}`),
  ];
  if (check) {
    console.log(diffs.length ? `FAIL\n${diffs.join("\n")}` : `PASS: ${files.size} files match`);
    process.exit(diffs.length ? 1 : 0);
  }
  rmSync(OUT, { recursive: true, force: true });
  for (const [f, d] of files) {
    mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true });
    writeFileSync(path.join(OUT, f), d);
  }
  console.log(`wrote ${files.size} files to ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
