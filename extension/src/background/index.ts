/**
 * RepoLens - Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[RepoLens Background] Extension freshly installed.');
  } else if (details.reason === 'update') {
    console.log('[RepoLens Background] Extension updated to version:', chrome.runtime.getManifest().version);
  }
});

// Top-level message passing listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
    return false;
  }

  // Future message handlers (for backend coordination, storage, etc.)
  return false;
});
