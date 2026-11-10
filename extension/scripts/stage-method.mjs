// Copies the flattened JEF method (buildProject output) into the extension package.
// The extension source holds no method text of its own.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildProject, projectDir } from '../../plugins/scripts/build-zip.mjs';

export async function stageMethod(dest) {
  const written = await buildProject();
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(projectDir, dest, { recursive: true });
  return { written, dest, projectDir };
}
