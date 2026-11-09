// The side panel is available on every tab. On PJe it shows the inventory; elsewhere it offers
// the offline PDF page. The toolbar click opens the panel. If that panel cannot be armed, the
// same click opens the PDF page. The worker holds no case data, so a restart cannot mix cases.
const PDF_PAGE = 'manual/lume-pdf.html';
let panelClickOpensPanel = false;

function openPdfMode() {
  chrome.tabs.create({ url: chrome.runtime.getURL(PDF_PAGE) });
}

// Fires only when the click did not open the side panel.
chrome.action.onClicked.addListener(() => {
  if (!panelClickOpensPanel) openPdfMode();
});

const sidePanel = chrome.sidePanel;
if (sidePanel?.setOptions && sidePanel?.setPanelBehavior) {
  sidePanel.setOptions({ enabled: true, path: 'panel.html' })
    .then(() => sidePanel.setPanelBehavior({ openPanelOnActionClick: true }))
    .then(() => { panelClickOpensPanel = true; })
    .catch(() => { panelClickOpensPanel = false; });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'lume:state' && sender.tab?.id != null) {
    sidePanel?.setOptions({ tabId: sender.tab.id, path: 'panel.html', enabled: true })?.catch(() => {});
  }
});
