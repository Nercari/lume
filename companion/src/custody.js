// Token custody. The refresh and ID tokens live only in the injected OS vault adapter; the access
// token lives only in this process's memory. Nothing here returns a raw token to the extension.
//
// Vault adapter contract (production: Windows Credential Manager, macOS Keychain, libsecret;
// tests: an in-memory fake):
//   get(key): Promise<string|null>   set(key, value): Promise<void>   delete(key): Promise<void>
import { Secret } from './redact.js';
import { AuthError, checkPlanScope } from './auth.js';

// Refresh errors that mean the token set is unusable (errors-and-recovery page).
export const TERMINAL_REFRESH_ERRORS = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
]);

const REFRESH_MARGIN_MS = 60 * 1000;

export class TokenCustody {
  #vault;
  #key;
  #access = null; // { token: Secret, expiresAt: number, scope: string }
  #refreshing = null;
  #persisted = []; // Secrets for vault-held tokens, so the redactor knows their values

  constructor({ vault, accountKey, clientId, now = Date.now }) {
    for (const m of ['get', 'set', 'delete']) if (typeof vault?.[m] !== 'function') throw new TypeError(`vault adapter lacks ${m}()`);
    if (typeof accountKey !== 'string' || !accountKey) throw new TypeError('accountKey is required');
    if (typeof clientId !== 'string' || !clientId) throw new TypeError('clientId (the per-user issued ID) is required');
    this.#vault = vault;
    this.#key = `lume.chatgpt.${accountKey}`;
    this.clientId = clientId;
    this.now = now;
  }

  // Store a token-endpoint response. Access token, expiry, scopes and rotating refresh token are replaced together.
  async store(resp) {
    checkPlanScope(resp.scope);
    if (!resp.refresh_token || !resp.access_token) throw new AuthError('bad_token_response', 'token response is incomplete');
    await this.#vault.set(this.#key, JSON.stringify({ refresh_token: resp.refresh_token, id_token: resp.id_token ?? null, scope: resp.scope }));
    this.#track([resp.refresh_token, resp.id_token]);
    this.#setAccess(resp);
  }

  #track(values) {
    for (const s of this.#persisted) s.forget();
    this.#persisted = values.filter(Boolean).map((v) => new Secret(v));
  }

  #setAccess(resp) {
    this.#access?.token.forget();
    this.#access = { token: new Secret(resp.access_token), expiresAt: this.now() + Number(resp.expires_in ?? 3600) * 1000, scope: resp.scope };
  }

  // Returns a valid in-memory access token (Secret), refreshing through `refreshFn` when near expiry.
  // refreshFn({ refreshToken: Secret, clientId }) performs the network call and returns a token response
  // or throws an error with `.code`.
  async accessToken(refreshFn) {
    if (this.#access && this.#access.expiresAt - REFRESH_MARGIN_MS > this.now()) return this.#access.token;
    // Serialize: a rotating refresh token must never be used twice.
    this.#refreshing ??= this.#refresh(refreshFn).finally(() => (this.#refreshing = null));
    return this.#refreshing;
  }

  async #refresh(refreshFn) {
    const raw = await this.#vault.get(this.#key);
    if (!raw) throw new AuthError('auth_expired', 'not signed in');
    const record = JSON.parse(raw);
    if (this.#persisted.length === 0) this.#track([record.refresh_token, record.id_token]);
    let resp;
    try {
      resp = await refreshFn({ refreshToken: new Secret(record.refresh_token), clientId: this.clientId });
    } catch (e) {
      if (TERMINAL_REFRESH_ERRORS.has(e?.code)) {
        await this.clear();
        throw new AuthError('auth_expired', 'session expired');
      }
      throw e; // transient: keep credentials (do not erase on network failure)
    }
    await this.store({ ...resp, id_token: resp.id_token ?? record.id_token });
    return this.#access.token;
  }

  // Revoke (injected) then clear local tokens. Reports whether remote revocation was confirmed.
  async logout(revokeFn) {
    const raw = await this.#vault.get(this.#key);
    let revoked = false;
    if (raw && revokeFn) {
      try {
        await revokeFn({ refreshToken: new Secret(JSON.parse(raw).refresh_token), clientId: this.clientId });
        revoked = true;
      } catch {
        revoked = false;
      }
    }
    await this.clear();
    return { revoked };
  }

  async clear() {
    this.#access?.token.forget();
    this.#access = null;
    await this.#vault.delete(this.#key);
    this.#track([]);
  }

  // Diagnostics-safe view.
  async describe() {
    return { signedIn: Boolean(await this.#vault.get(this.#key)), accessValid: Boolean(this.#access && this.#access.expiresAt > this.now()) };
  }
}
