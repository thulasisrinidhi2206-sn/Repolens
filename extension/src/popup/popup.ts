/**
 * RepoLens Popup Script
 */

const statusEl = document.getElementById('backend-status') as HTMLParagraphElement;
const checkBtn = document.getElementById('check-status-btn') as HTMLButtonElement;

const BACKEND_URL = 'http://localhost:3001/api/health';

async function checkBackendHealth(): Promise<void> {
  if (!statusEl) return;
  statusEl.textContent = 'Connecting...';

  try {
    const res = await fetch(BACKEND_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    statusEl.textContent = `Connected (${data.data?.status || 'OK'})`;
  } catch (_err) {
    statusEl.textContent = 'Offline (Backend not reachable)';
  }
}

if (checkBtn) {
  checkBtn.addEventListener('click', () => {
    checkBackendHealth();
  });
}

// Initial health check on popup load
checkBackendHealth();
