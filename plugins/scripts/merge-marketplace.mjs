import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

export const templatePath = path.resolve(
  scriptsDir,
  "../lume-jef/instalar/marketplace-entry.json",
);

export const marketplaceName = "lume-local";
export const marketplaceDisplayName = "Lume";

export async function loadEntry() {
  return JSON.parse(await readFile(templatePath, "utf8"));
}

export function mergeMarketplace(existing, entry) {
  const doc =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? structuredClone(existing)
      : {};
  doc.name = marketplaceName;
  const interfaceObj =
    doc.interface && typeof doc.interface === "object" && !Array.isArray(doc.interface)
      ? structuredClone(doc.interface)
      : {};
  interfaceObj.displayName = marketplaceDisplayName;
  doc.interface = interfaceObj;
  const plugins = Array.isArray(doc.plugins) ? doc.plugins : [];
  const next = [];
  let placed = false;
  for (const plugin of plugins) {
    if (plugin && plugin.name === "lume-jef") {
      if (!placed) {
        next.push(structuredClone(entry));
        placed = true;
      }
      continue;
    }
    next.push(plugin);
  }
  if (!placed) next.push(structuredClone(entry));
  doc.plugins = next;
  return doc;
}

export function marketplacePath(home) {
  return path.join(home, ".agents", "plugins", "marketplace.json");
}

export async function writeMarketplace(home, entry = undefined) {
  const pluginEntry = entry ?? (await loadEntry());
  const dest = marketplacePath(home);
  let existing = null;
  try {
    existing = JSON.parse(await readFile(dest, "utf8"));
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  const merged = mergeMarketplace(existing, pluginEntry);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}
