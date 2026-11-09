// The fixed command handlers. Network steps (code exchange, revocation) are injected so the
// companion can be tested offline; the live implementations are pending #5 account validation.
import { createAttempt, buildAuthorizeUrl, startCallbackListener } from './auth.js';
import { pauseFor } from './pause.js';

export function createHandlers({ registration, custody, exchange, revoke, listen = startCallbackListener, timeoutMs }) {
  let pause = null;
  let pending = null;

  const onFailure = (e) => {
    pause = pauseFor(e) ?? pause;
  };

  const handlers = {
    status: async () => ({ ...(await custody.describe()), pause }),

    'login.start': async () => {
      pending?.close(); // only one sign-in attempt at a time
      const attempt = createAttempt();
      const listener = await listen({ attempt, timeoutMs });
      pending = listener;
      listener.result
        .then((code) => exchange({ code, attempt, redirectUri: listener.redirectUri, registration }))
        .then((tokens) => custody.store(tokens))
        .then(() => (pause = null), onFailure)
        .finally(() => pending === listener && (pending = null));
      // The extension opens this URL in a tab; the companion never launches a browser itself.
      return { authorizeUrl: buildAuthorizeUrl(registration, attempt, listener.redirectUri) };
    },

    logout: async () => {
      pending?.close();
      return custody.logout(revoke);
    },
  };
  // reportFailure is for the inference path (out of scope here); it is not a host command.
  return { handlers, reportFailure: onFailure };
}
