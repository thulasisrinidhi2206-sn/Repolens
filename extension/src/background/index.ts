/**
 * RepoLens Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[RepoLens] Extension installed successfully.');
});

// Listener for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[RepoLens Background] Message received:', message);

  if (message.type === 'PING') {
    sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
  }

  return true;
});
