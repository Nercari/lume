// Build Chrome Native Messaging host manifest JSON (no I/O).
export const HOST_NAME = 'com.lume.chatgpt';
export const EXTENSION_ID = 'odjfiioakpihgkikmjadmohgckkhkjhi';
export const ALLOWED_ORIGIN = `chrome-extension://${EXTENSION_ID}/`;

export function buildHostManifest({ hostPath, description = 'Lume companion: Native Messaging host for the Lume extension' }) {
  if (!hostPath || typeof hostPath !== 'string') throw new Error('hostPath required');
  return {
    name: HOST_NAME,
    description,
    path: hostPath,
    type: 'stdio',
    allowed_origins: [ALLOWED_ORIGIN],
  };
}

/** Doubles backslashes for embedding a Windows path inside a JSON string literal (e.g. PowerShell here-string). */
export function escapeWindowsPathForJson(absPath) {
  return absPath.replace(/\\/g, '\\\\');
}
