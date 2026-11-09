# Auth route: Sign in with ChatGPT through a local companion

Part of #5. This file records what official documentation says, as read on 2026-11-09.
It uses only OpenAI and Chrome documentation. Each statement has a source.
**UNVERIFIED** means that no official page we read documents the item.
**BLOCKED** means that the check needs a real supported account or a managed workstation.
No live sign-in, model call, or account check was done for this file.

## Sources

| Key | URL | Read result |
|-----|-----|-------------|
| OAI-OSS | https://developers.openai.com/siwc/token-sharing-open-source | Read |
| OAI-SIGNIN | https://developers.openai.com/siwc/token-sharing-open-source/sign-in | Read |
| OAI-SESS | https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions | Read |
| OAI-MODELS | https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference | Read |
| OAI-TOKEN | https://developers.openai.com/siwc/token-sharing-open-source/token-reference | Read |
| OAI-ERR | https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery | Read |
| OAI-LIMITS | https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations | Read |
| OAI-CLIENTID | https://developers.openai.com/siwc/request-client-id | Read |
| OAI-HELP | https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites | **Not read** (HTTP 403 to our fetcher) |
| CR-NM | https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging | Read |
| CR-ID | https://developer.chrome.com/docs/extensions/reference/api/identity | Read |
| CR-SW | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle | Read |
| CR-POL | https://chromeenterprise.google/policies/ | **Not read** (page content did not render for our fetcher) |

## 1. OAuth route for open-source and local clients

Documented (OAI-SIGNIN unless noted):

- Authorize endpoint: `https://auth.openai.com/api/accounts/authorize`.
  Token endpoint: `https://auth.openai.com/api/accounts/oauth/token`.
  Resource: `https://api.openai.com/v1`. Issuer: `https://auth.openai.com`.
- Grant: `response_type=code` with a form-encoded `authorization_code` exchange.
  There is no client secret: "This direct flow needs neither a client secret nor a partner API key."
- PKCE: `code_challenge_method=S256`. The challenge is the base64url SHA-256 of the verifier, without padding.
- State and nonce: a fresh random `state`, OIDC `nonce`, and PKCE verifier for each attempt.
  Validate `state` on return. Check `nonce` during ID-token validation.
- Scopes: `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`.
  "A valid ID token alone does not authorize ChatGPT plan usage." The granted scopes must include `chatgpt.tokens.use.direct`.
- Redirect URI: HTTP loopback on `127.0.0.1`, for example `http://127.0.0.1:1455/auth/callback`.
  "Only the port may vary." "Do not substitute with `localhost`." The path must stay `/auth/callback`.
  The same URI goes in the authorization request and in the code exchange.
- `error=access_denied` on the callback: stop, and do not exchange the code.
- `invalid_grant` on code exchange: discard the code and start a new authorization.

Consequence for Lume: the documented redirect is a loopback HTTP listener.
`chrome.identity.launchWebAuthFlow` documents only redirects that match `https://<app-id>.chromiumapp.org/*` (CR-ID).
CR-ID does not document loopback redirects. Thus an extension-only route is **UNVERIFIED**,
and the companion keeps the loopback listener (#5, Work item 2).

## 2. Registration and client binding

Documented (OAI-SIGNIN, OAI-OSS, OAI-SESS):

- First sign-in uses `client_id=dynamic_agent_client` with `agent_name_hint` and `ext_agent_host_id`.
  `dynamic_agent_client` "is the first-time registration entrypoint, not the client ID to save or use for token exchange."
- OpenAI issues a client ID. Save it with the registration for that ChatGPT account and reuse it.
- "each issued client_id is bound to the authenticated user and the workspace selected during registration."
  "The client stays bound to its registered workspace." Email and `sub` are not workspace identifiers.
- `ext_agent_host_id` is required, is distinct per host, and must be persisted before the first sign-in.
  Formats: `urn:ietf:params:oauth:jwk-thumbprint:…` (recommended), `urn:uuid:…`, `did:key:<key>`.
- An issued client ID can be reused across hosts for the same user and workspace. Each host has its own host ID.
- Keep each registration separate, even when emails match. "Never overwrite another account registration's credentials."
- The OSS documentation targets open-source and locally hosted apps. A paid or remotely hosted app must complete an interest form (OAI-OSS).

Lume implementation: `createRegistration()` in `src/auth.js` takes a per-user host ID and the issued client ID.
The source contains no client ID. `test/no-paid-fallback.test.js` checks this.

**UNVERIFIED:** OAI-CLIENTID says "Sign in with ChatGPT is currently offered to a select group of commercial partners."
The OSS pages describe dynamic registration with no partner step.
No page we read says if an unlisted open-source project can use dynamic registration today. Only a live attempt can show this (BLOCKED, B1).

## 3. Eligibility

Documented:

- "ChatGPT plan usage is an optional capability within Sign in with ChatGPT" (OAI-OSS).
  It does not give access to the user's ChatGPT conversations (OAI-OSS).
- `subscription_sharing_user_not_eligible` (HTTP 403): "ChatGPT plan usage is unavailable for the selected user, workspace, or policy."
  Do not retry. Do not loop through OAuth (OAI-ERR).

**UNVERIFIED:** which ChatGPT plans qualify (Free, Plus, Pro, Business, Enterprise, Edu).
**UNVERIFIED:** which workspace-admin controls enable or disable plan usage for other apps.
OAI-HELP probably covers both, but we could not read it.

## 4. Supported models and inference limits

Documented (OAI-MODELS, OAI-LIMITS):

- List models with `GET https://api.openai.com/v1/models` and the same access token. Keep `visibility == "list"`.
  Show `display_name`, and send `slug` as `model`. Refresh the list when the account changes.
- Inference: `POST https://api.openai.com/v1/responses`. Do not use ChatGPT `backend-api` endpoints.
- Each request sets `store: false` and `stream: true`. Success is only `response.completed`.
- Unsupported: `temperature`, `top_p`, `metadata`, `user`, `previous_response_id` over HTTP,
  audio/video input, the Files upload API, transcription, and hosted tools.

**UNVERIFIED:** the model list. It depends on the account; the docs give no fixed list.
**UNVERIFIED:** function calling (local tools) in this flow. OAI-MODELS does not mention it,
and OAI-LIMITS lists only hosted tools as unsupported. The "bounded local read-tool call" in #5 is BLOCKED (B3).

## 5. Tokens, refresh, logout, revocation

Documented (OAI-TOKEN, OAI-SESS, OAI-SIGNIN):

- Access token: one hour (`expires_in: 3600`). Refresh token: 30 days; each refresh gives a new 30-day token.
- Refresh: form POST to the token endpoint with `grant_type=refresh_token`, `refresh_token`, `resource`, and the issued `client_id`.
  Omit `scope`. Refresh tokens rotate: "Store and use the latest replacement."
  Replace access token, expiry, scopes, and refresh token together. Serialize refreshes for one session.
- Logout: stop requests, try revocation, then clear access, refresh, and ID tokens. Keep the client mapping and host ID.
- Revocation: `revocation_endpoint` from `https://auth.openai.com/.well-known/openid-configuration`.
  Form POST with `token`, `token_type_hint=refresh_token`, `client_id`. "An empty HTTP `200` is the revocation success response."
  If revocation is not confirmed, tell the user and point to ChatGPT Settings.
- "OpenAI does not currently notify your tool when a user disconnects the app in ChatGPT settings" (OAI-ERR).
- Terminal refresh errors: `invalid_grant`, `invalid_refresh_token`, `token_expired`, `refresh_token_expired`,
  `refresh_token_invalidated`, `refresh_token_reused`. Clear tokens and sign in again.
  Do not erase credentials because of a temporary network failure (OAI-ERR).
- Storage: keep tokens "in protected local or self-hosted runtime storage", and out of browser storage,
  source control, logs, analytics, and support transcripts. Never put tokens in URLs (OAI-SESS).

Lume decision (Work item 4): the companion keeps the refresh token and ID token in the OS vault through an injected adapter
(`src/custody.js`). The access token stays in companion memory. No command returns a token to the extension.
The OS vault is not named by OpenAI; it is our choice inside "protected local storage".

## 6. Quota and failure behavior

Documented (OAI-ERR, OAI-MODELS):

| Code | HTTP | Documented action | Lume pause (`src/pause.js`) |
|------|------|-------------------|-----------------------------|
| `subscription_sharing_usage_limit_exceeded` | 429 | Pause plan requests; link to ChatGPT settings → Usage. Do not infer a reset time. | `quota_exhausted` |
| `subscription_sharing_usage_unavailable` | 503 | Retry later with bounded backoff. | `usage_unavailable` |
| `subscription_sharing_user_not_eligible` | 403 | Explain; do not retry. | `not_eligible` (not resumable) |
| `subscription_sharing_invalid_user` | 401 | Sign in again after confirmed revocation or terminal refresh error. | `auth_expired` |
| plan scope missing / consent declined | — | Mark plan usage disabled; repeat OAuth with the full scope. | `plan_disabled` |
| `invalid_client` | — | Fix the client configuration. | `client_config` |

- Usage-limit errors can arrive as `response.failed` after streaming started (OAI-MODELS).
- "ChatGPT plan usage errors stop inference." OpenAI does not switch billing automatically (OAI-ERR).
- OAI-ERR suggests offering "another billing path, such as the user's own API key". **Lume does not do this.**
  The product contract (#1) forbids a switch to paid API credits. The code has no API-key path; `test/no-paid-fallback.test.js` checks this.

**UNVERIFIED:** quota sizes, reset windows, and whether plan usage shares the ChatGPT app limits.

## 7. Chrome Native Messaging

Documented (CR-NM, CR-SW):

- Framing: JSON, UTF-8, "preceded with 32-bit message length in native byte order."
  Lume uses little-endian and refuses to start on a big-endian platform (`src/framing.js`).
- Size limits: host → Chrome 1 MB per message; Chrome → host 64 MiB. Lume caps inbound messages at 64 KiB.
- Host manifest: `name` (lowercase alphanumerics, `_`, `.`), `path` (absolute on Linux/macOS), `type: "stdio"`,
  `allowed_origins` ("can't contain wildcards").
- "The first argument to the native messaging host is the origin of the caller." Lume compares it to one allow-listed origin.
- Manifest locations: Windows registry `HKEY_LOCAL_MACHINE` or `HKEY_CURRENT_USER` `\SOFTWARE\Google\Chrome\NativeMessagingHosts\<name>`;
  macOS `/Library/Google/Chrome/NativeMessagingHosts/` (system) or `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` (user);
  Linux `/etc/opt/chrome/native-messaging-hosts/` (system) or `~/.config/google-chrome/NativeMessagingHosts/` (user).
- `connectNative()` keeps the MV3 service worker alive; reconnect in `onDisconnect` (CR-SW).

**UNVERIFIED:** the enterprise policies `NativeMessagingAllowlist`, `NativeMessagingBlocklist`, and
`NativeMessagingUserLevelHosts`, and extension install policies. CR-POL lists them, but we could not read their text.
These policies decide if a managed workstation can install the host (B5).

## 8. What the companion implements (offline)

| Requirement | File | Test |
|-------------|------|------|
| Framing, size limits | `src/framing.js` | `test/framing.test.js` |
| Typed commands, origin allow-list, no general API | `src/commands.js`, `src/host.js` | `test/host.test.js` |
| Loopback listener, state, PKCE S256, nonce, timeout, single use, closure | `src/auth.js` | `test/callback.test.js` |
| Token custody (vault adapter), redaction | `src/custody.js`, `src/redact.js` | `test/custody.test.js`, `test/redact.test.js` |
| Pause states, no paid fallback | `src/pause.js` | `test/pause.test.js`, `test/no-paid-fallback.test.js` |
| Command wiring | `src/handlers.js` | `test/handlers.test.js` |

Not implemented (needs live validation first): the HTTP calls for code exchange, refresh, and revocation;
ID-token signature checks against the issuer JWKS; OS vault adapters (Windows Credential Manager, macOS Keychain, libsecret);
the host manifest and installer; inference and streaming.

## 9. Remaining checks

| ID | Check | Status | Needs |
|----|-------|--------|-------|
| B1 | Dynamic registration works for Lume as an open-source local app | BLOCKED | A real ChatGPT account on an eligible plan |
| B2 | Eligible plans and workspace controls (OAI-HELP) | BLOCKED | A readable copy of OAI-HELP, and a test on the target account/workspace |
| B3 | Login, streaming, bounded local tool call, refresh, logout, revocation | BLOCKED | A real supported account |
| B4 | Evidence of the model route and that no paid credits or extra billing were enabled | BLOCKED | A real account and its usage/billing pages |
| B5 | Host install under the managed workstation's Chrome policies and supported OS | BLOCKED | A representative managed workstation and its policy export |
| B6 | Loopback port 1455 (or another) is free and not blocked by endpoint security on the workstation | BLOCKED | The managed workstation |
| B7 | OS vault access from the companion process under workstation policy | BLOCKED | The managed workstation |

## 10. O que falta para o Sign in with ChatGPT funcionar

O modo suportado hoje é o modo manual (`manual/`): a pessoa baixa o PDF dos autos no PJe, monta o pacote neste computador e cola o texto no ChatGPT que ela mesma abre. Esse caminho não faz login, não troca token e não chama a API.

O Sign in with ChatGPT ainda não funciona. Falta:

1. **Registro dinâmico (`dynamic_agent_client`).** As páginas de código aberto descrevem esse ponto de entrada, mas a página de client ID diz que o Sign in with ChatGPT é oferecido a um grupo selecionado de parceiros. Um aplicativo aberto que não está nessa lista pode ser recusado. Isso só se confirma com uma tentativa ao vivo na conta ChatGPT do Pedro, ou com o formulário da OpenAI de pedido de client ID (OAI-CLIENTID). Nenhum dos dois foi feito.

2. **HTTP de troca do código, de refresh e de revogação.** O companion valida o retorno no loopback (state, PKCE, nonce, prazo, uso único). Ele não envia o código ao endpoint de token, não renova o refresh token e não revoga a sessão. A seção 8 lista o que já existe e o que ficou de fora.

3. **Adaptadores do cofre do sistema.** A custódia espera um adaptador injetado. Não há implementação para o Credential Manager do Windows, o Keychain do macOS nem o libsecret. Sem isso o refresh token não tem onde ficar no posto de trabalho.

4. **Política da estação gerenciada.** O texto das políticas `NativeMessagingAllowlist`, `NativeMessagingBlocklist` e `NativeMessagingUserLevelHosts`, e a política de instalação da extensão, não foi conferido. Sem o export da política da estação, não dá para dizer se o host nativo pode ser instalado.

5. **Porta de loopback.** O redirect documentado é `http://127.0.0.1:<porta>/auth/callback` (só a porta varia; o exemplo da documentação é 1455; o caminho continua `/auth/callback`). Não foi verificado se essa porta está livre nem se o antivírus ou a política da estação a bloqueia.

Até esses itens terem evidência, o modo manual é o caminho suportado. O issue #5 continua aberto.
