// Archive a bundle directory without npm deps. No network.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const ZIP_SKIP_MESSAGE =
  'bundle: --zip skipped (need the zip CLI or Windows PowerShell Compress-Archive; the bundle directory is still complete)';

export function archiveBundleDir(outDir, zipPath) {
  const absZip = resolve(zipPath);
  mkdirSync(dirname(absZip), { recursive: true });
  if (existsSync(absZip)) rmSync(absZip);

  const zip = spawnSync('zip', ['-r', '-q', absZip, '.'], { cwd: outDir, encoding: 'utf8' });
  if (zip.status === 0 && existsSync(absZip)) {
    return { ok: true, path: absZip, tool: 'zip' };
  }

  if (process.platform === 'win32') {
    const escapedOut = outDir.replace(/'/g, "''");
    const escapedZip = absZip.replace(/'/g, "''");
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${escapedOut}\\*' -DestinationPath '${escapedZip}' -Force`,
      ],
      { encoding: 'utf8' },
    );
    if (ps.status === 0 && existsSync(absZip)) {
      return { ok: true, path: absZip, tool: 'Compress-Archive' };
    }
  }

  return { ok: false, message: ZIP_SKIP_MESSAGE };
}
