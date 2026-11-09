// Chrome wiring for the adapter. scripts/build.mjs puts core.js in front of this file.
// Requests go through the page's own fetch on the same origin, so the browser attaches the PJe
// session itself. Lume never reads cookies, credentials or certificates, and never navigates.
const tracker = createTracker({
  getDoc: () => document,
  getUrl: () => location.href,
  fetchPage: async (url, signal) => {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal });
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      // Inventory only checks that the document is reachable and supported; extraction is #2.
      await res.body?.cancel();
      return { status: res.status, contentType, size: Number(res.headers.get('content-length')) || null, doc: null };
    }
    const html = await res.text();
    return { status: res.status, contentType, size: html.length, doc: new DOMParser().parseFromString(html, 'text/html') };
  },
  publish: (state) => chrome.runtime.sendMessage({ type: 'lume:state', state }).catch(() => {}),
});

// Debounced: a burst of DOM changes costs one re-parse. Reads stay safe in the gap because
// readCase calls refresh() itself before it uses each response.
let pending = null;
new MutationObserver(() => {
  clearTimeout(pending);
  pending = setTimeout(() => tracker.refresh(), 250);
}).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
addEventListener('popstate', () => tracker.refresh());
addEventListener('hashchange', () => tracker.refresh());

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'start') tracker.start();
  else if (msg?.type === 'stop') tracker.stop();
  else if (msg?.type !== 'status') return;
  reply(tracker.status());
});

chrome.runtime.sendMessage({ type: 'lume:state', state: tracker.status() }).catch(() => {});
