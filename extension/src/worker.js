// The side panel opens from the toolbar button and is enabled only on tabs where the PJe content
// script runs. The worker holds no case data, so a worker restart cannot mix cases.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.sidePanel.setOptions({ enabled: false }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'lume:state' && sender.tab?.id != null) {
    chrome.sidePanel.setOptions({ tabId: sender.tab.id, path: 'panel.html', enabled: true }).catch(() => {});
  }
});
