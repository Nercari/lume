import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pluginRoot, zipStored } from "./build-zip.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const overlayRoot = path.resolve(scriptsDir, "../lume-jef-publico");
export const publicRoot = path.resolve(scriptsDir, "../dist/lume-jef-publico");
export const publicZipPath = path.resolve(scriptsDir, "../dist/lume-jef-publico-1.0.0.zip");

// The installer is a local Windows script for the desktop marketplace; a directory
// package installs from the directory, so it never ships publicly.
export const dropped = ["instalar"];

const PROFILE = "`perfil-estilo.md` do usuário, quando houver,";

// The public build keeps the method and drops the private relatoria's style.
// Every rule must match, so a source edit that moves a passage fails the build
// instead of shipping it.
export const redactions = [
  {
    file: "skills/jef-director/SKILL.md",
    find: "`skills/jef-estilo/SKILL.md` só para perfil de forma",
    replace: "`skills/jef-estilo/SKILL.md` só para perfil de forma. Sem perfil, vale o formato padrão neutro JEF-V1; com `perfil-estilo.md`, a forma dele prevalece sobre JEF-V1, nunca sobre os fatos",
  },
  {
    file: "skills/jef-estilo/SKILL.md",
    find: "O perfil governa só a forma.",
    replace: "O perfil governa só a forma e prevalece sobre o formato padrão JEF-V1.",
  },
  {
    file: "skills/jef-director/references/diretor.md",
    find: "trate o conteúdo mantido em `relatoria-sjdf-votos` como fonte do padrão pessoal, sem exigir sua ativação no runtime",
    replace: `trate o formato JEF-V1 e o ${PROFILE} como fonte do padrão de forma`,
  },
  {
    file: "skills/jef-director/references/diretor.md",
    find: "Incorpore diretamente a governança da Relatoria:",
    replace: "Aplique o formato padrão JEF-V1, salvo forma diversa no `perfil-estilo.md` do usuário:",
  },
  {
    file: "skills/jef-director/references/diretor.md",
    find: "incorpore diretamente a estrutura e o estilo mantidos em `relatoria-sjdf-votos`, sem exigir sua ativação",
    replace: "aplique a estrutura JEF-V1 e, quando houver, o `perfil-estilo.md` do usuário",
  },
  {
    file: "skills/jef-director/references/diretor.md",
    find: "de `relatoria-sjdf-votos`",
    replace: "de `jef-director`",
  },
  {
    file: "skills/jef-director/references/diretor.md",
    find: "`relatoria-sjdf-votos`",
    replace: "`jef-voto`",
  },
  { file: "skills/jef-director/references/diretor.md", find: "governança da relatoria", replace: "governança de forma" },
  { file: "skills/jef-director/references/diretor.md", find: "padrão da relatoria", replace: "padrão de forma" },
  { file: "skills/jef-director/references/diretor.md", find: "fluxo pessoal", replace: "fluxo" },
  { file: "skills/jef-director/references/diretor.md", find: "estrutura pessoal", replace: "estrutura definida pelo usuário" },
  { file: "skills/jef-relatorio/references/c4.md", find: "no padrão pessoal", replace: "no padrão de forma" },
  {
    file: "skills/jef-voto/references/c6.md",
    find: "Por pedido expresso de manutenção em 21/10/2026, adotar nos votos de\nmanutenção",
    replace: "Adotar como referência nos votos de\nmanutenção",
  },
  {
    file: "skills/jef-voto/references/c6.md",
    find: "padrão pessoal de honorários",
    replace: "padrão de honorários do perfil-estilo.md, quando houver,",
  },
  {
    file: "skills/jef-voto/references/c6.md",
    find: ", por diretriz expressa da\nusuária em 09/10/2026:",
    replace: ":",
  },
  {
    file: "skills/jef-voto/references/c6.md",
    find: "### C6.6. Padrão pessoal de valoração pericial",
    replace: "### C6.6. Valoração pericial",
  },
  {
    file: "skills/jef-voto/references/c6.md",
    find: "Por autorização expressa de manutenção em 26/10/2026, esta é uma preferência\ndurável de redação deste projeto, nos termos de MEM-001. Aplica-se",
    replace: `Padrão neutro, substituível pelo ${PROFILE} e aplicável`,
  },
  {
    re: /Na valoração autônoma, usar o texto aprovado[\s\S]*?Preservar a formulação, sem substituí-la por comentário a relatório particular\./,
    file: "skills/jef-voto/references/c6.md",
    replace: `Na valoração autônoma, explicar com palavras próprias, a partir das premissas
sustentadas pelos autos, por que o laudo judicial prevalece ou não. Se houver
fórmula própria no ${PROFILE} usá-la nas mesmas condições.`,
  },
  {
    file: "skills/jef-voto/references/c6.md",
    find: "A fórmula aprovada não sana",
    replace: "A valoração não sana",
  },
  {
    file: "skills/jef-revisao/references/c8.md",
    find: "fórmula aprovada e premissas",
    replace: "valoração e premissas",
  },
  {
    file: "skills/jef-revisao/references/cenarios.md",
    find: "Fórmula aprovada em parágrafo próprio",
    replace: "Valoração em parágrafo próprio",
  },
  {
    file: "skills/jef-director/references/instrucoes.md",
    find: "Aplicar a fórmula aprovada em C6.6.",
    replace: "Aplicar a valoração de C6.6.",
  },
  {
    file: "skills/jef-director/references/contrato.md",
    find: "Aplicar a fórmula aprovada em C6.6.",
    replace: "Aplicar a valoração de C6.6.",
  },
  {
    re: /7\. se o Google Drive estiver disponível[^\n]*\n/,
    file: "skills/jef-director/references/diretor.md",
    replace: `7. carregue como preferências aprovadas apenas o ${PROFILE} e as regras que o usuário aprovou na conversa atual; não consulte nem grave memória externa\n`,
  },
  {
    re: /\| Memória externa \|[^\n]*\n/,
    file: "skills/jef-director/references/diretor.md",
    replace: "",
  },
  {
    re: /- Quando o Google Drive estiver disponível, use a aba `CORRECOES`[^\n]*\n- Se o painel não estiver acessível[^\n]*\n\nO painel de correções não substitui[^\n]*\n/,
    file: "skills/jef-director/references/diretor.md",
    replace: "- Não grave correções em serviço externo. A observação fica só na conversa atual.\n",
  },
  {
    re: /### Persistência aprovada no Custom GPT[\s\S]*?nem fabrique ID ou versão\.\n/,
    file: "skills/jef-director/references/diretor.md",
    replace: `### Persistência de preferências

Este plugin não grava memória externa. Para tornar uma preferência durável, mostre o texto exato e peça ao usuário que o acrescente ao seu \`perfil-estilo.md\`. Nunca simule salvamento nem prometa carregamento na sessão seguinte.
`,
  },
  {
    file: "skills/jef-voto/references/c6.md",
    find: "Aplicar integralmente JEF-V1 do contrato:",
    replace: "Aplicar JEF-V1 do contrato, salvo forma diversa no `perfil-estilo.md` do usuário:",
  },
  {
    file: "skills/jef-voto/references/jef-v1.md",
    find: "`JEF-V1` is frozen to the migration matrix and its pinned baseline.",
    replace: "In this public build, the user's `perfil-estilo.md` counts as an express format exception to FMT-001 to FMT-005, FMT-007 and FMT-009 for every product until the user says otherwise. It never changes facts, result or coverage.\n\n`JEF-V1` is frozen to the migration matrix and its pinned baseline.",
  },
  {
    file: "skills/jef-director/references/contrato.md",
    find: "`JEF-V1` is frozen to the migration matrix and its pinned baseline.",
    replace: "In this public build, the user's `perfil-estilo.md` counts as an express format exception to FMT-001 to FMT-005, FMT-007 and FMT-009 for every product until the user says otherwise. It never changes facts, result or coverage.\n\n`JEF-V1` is frozen to the migration matrix and its pinned baseline.",
  },
];

// Gendered references to the private user become the neutral "usuário".
const neutral = [
  [/\bA usuária\b/g, "O usuário"],
  [/\bda usuária\b/g, "do usuário"],
  [/\bpela usuária\b/g, "pelo usuário"],
  [/\bà usuária\b/g, "ao usuário"],
  [/\bna usuária\b/g, "no usuário"],
  [/\bdessa usuária\b/g, "desse usuário"],
  [/\bdesta usuária\b/g, "deste usuário"],
  [/\ba usuária\b/g, "o usuário"],
  [/\busuária\b/g, "usuário"],
];

// Strings that identify the private relatoria or its approved formulas.
export const forbidden = [
  "relatoria-sjdf",
  "SJDF",
  "Relatoria",
  "padrão pessoal",
  "usuária",
  "laudo oficial encontra-se bem fundamentado",
  "fórmula aprovada",
  "21/10/2026",
  "26/10/2026",
  "09/10/2026",
  "instalar-plugin",
  "Google Drive",
  "MEMORIA_APROVADA",
  "CONTROLE_AGENTES",
  "CORRECOES",
];

async function walk(dir, root, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs, root, acc);
    else if (entry.isFile() && entry.name !== ".DS_Store") {
      acc.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
  return acc;
}

function apply(rule, text) {
  if (rule.re) {
    if (!rule.re.test(text)) throw new Error(`redaction missed ${rule.re} in ${rule.file}`);
    return text.replace(rule.re, rule.replace);
  }
  if (!text.includes(rule.find)) throw new Error(`redaction missed "${rule.find}" in ${rule.file}`);
  return text.split(rule.find).join(rule.replace);
}

export async function buildPublic() {
  await rm(publicRoot, { recursive: true, force: true });
  await cp(pluginRoot, publicRoot, { recursive: true });
  for (const rel of dropped) await rm(path.join(publicRoot, rel), { recursive: true, force: true });
  await cp(overlayRoot, publicRoot, { recursive: true, force: true });

  for (const rule of redactions) {
    const abs = path.join(publicRoot, rule.file);
    await writeFile(abs, apply(rule, await readFile(abs, "utf8")));
  }

  const names = (await walk(publicRoot, publicRoot)).sort((a, b) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  );
  const files = [];
  for (const name of names) {
    const abs = path.join(publicRoot, name);
    let data = await readFile(abs);
    if (name.endsWith(".md")) {
      let text = data.toString("utf8");
      for (const [re, to] of neutral) text = text.replace(re, to);
      data = Buffer.from(text, "utf8");
      await writeFile(abs, data);
    }
    files.push({ name, data });
  }
  for (const { name, data } of files) {
    const text = data.toString("utf8");
    for (const needle of forbidden) {
      if (text.includes(needle)) throw new Error(`private marker "${needle}" left in ${name}`);
    }
  }
  const bytes = zipStored(files);
  await mkdir(path.dirname(publicZipPath), { recursive: true });
  await writeFile(publicZipPath, bytes);
  return { bytes, names, zipPath: publicZipPath };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const built = await buildPublic();
  process.stdout.write(`${built.zipPath} ${built.bytes.length} files ${built.names.length}\n`);
}
