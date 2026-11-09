// Synthetic fixtures only. No real tokens, accounts or endpoints.
export class MemoryVault {
  map = new Map();
  async get(k) { return this.map.get(k) ?? null; }
  async set(k, v) { this.map.set(k, v); }
  async delete(k) { this.map.delete(k); }
}

let n = 0;
export const fakeTokens = () => {
  n += 1;
  return {
    access_token: `synthetic-access-${n}-${'a'.repeat(24)}`,
    refresh_token: `synthetic-refresh-${n}-${'r'.repeat(24)}`,
    id_token: `eyJhbGciOiJub25lIn0.eyJzeW50aGV0aWMiOnRydWV9.sig${n}`,
    expires_in: 3600,
    scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
  };
};

export const codeError = (code) => Object.assign(new Error(code), { code });
