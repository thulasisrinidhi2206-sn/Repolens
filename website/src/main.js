const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

function closeNavigation() {
  if (!navToggle || !navLinks) return;
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Open navigation menu');
  navLinks.classList.remove('is-open');
}

navToggle?.addEventListener('click', () => {
  const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!isExpanded));
  navToggle.setAttribute('aria-label', isExpanded ? 'Open navigation menu' : 'Close navigation menu');
  navLinks?.classList.toggle('is-open', !isExpanded);
});

navLinks?.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', closeNavigation);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeNavigation();
});

document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const command = button.getAttribute('data-copy');
    if (!command) return;

    try {
      await navigator.clipboard.writeText(command);
      button.textContent = 'Copied';
    } catch (error) {
      console.error('Unable to copy the setup command:', error);
      button.textContent = 'Copy failed';
    }

    window.setTimeout(() => {
      button.textContent = 'Copy';
    }, 1800);
  });
});

const currentYear = document.querySelector('#current-year');
if (currentYear) currentYear.textContent = String(new Date().getFullYear());

const revealElements = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  document.documentElement.classList.add('has-reveal');
  revealElements.forEach(element => revealObserver.observe(element));
}


// Live website repository analyzer. The backend owns GitHub credentials;
// never expose the GitHub token in this browser code.
const analyzerForm = document.querySelector('#repo-analyzer-form');
const repositoryInput = document.querySelector('#repository-url');
const analyzeButton = document.querySelector('#analyze-button');
const analyzerStatus = document.querySelector('#analyzer-status');
const analysisResults = document.querySelector('#analysis-results');
const REPO_LENS_API = 'https://repolens-backend-gkdm.onrender.com';

function normalizeGitHubRepositoryUrl(value) {
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://github.com/${trimmed}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Enter a valid GitHub repository URL, such as https://github.com/facebook/react.');
  }
  if (parsed.hostname.toLowerCase() !== 'github.com' && parsed.hostname.toLowerCase() !== 'www.github.com') {
    throw new Error('Please use a repository URL from github.com.');
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || ['settings', 'marketplace', 'features', 'topics', 'collections'].includes(parts[0].toLowerCase())) {
    throw new Error('That does not look like a repository URL. Use https://github.com/owner/repository.');
  }
  return `https://github.com/${parts[0]}/${parts[1]}${parts.length > 2 ? '/' + parts.slice(2).join('/') : ''}`;
}

function appendResultElement(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value == null || value === '' ? 'Not available' : String(value);
  parent.appendChild(element);
  return element;
}

function renderRepositoryAnalysis(data) {
  analysisResults.replaceChildren();
  analysisResults.hidden = false;
  const heading = document.createElement('div');
  heading.className = 'analysis-result-heading';
  appendResultElement(heading, 'span', 'section-kicker', 'ANALYSIS COMPLETE');
  appendResultElement(heading, 'h3', '', data.repo ? `${data.repo.owner}/${data.repo.repo}` : 'Repository analysis');
  if (data.repositoryUrl) {
    const link = document.createElement('a');
    link.href = data.repositoryUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on GitHub ↗';
    heading.appendChild(link);
  }
  analysisResults.appendChild(heading);

  if (data.message) appendResultElement(analysisResults, 'p', 'analysis-summary', data.message);

  const metrics = document.createElement('div');
  metrics.className = 'analysis-metric-grid';
  const score = data.metrics?.overallScore;
  const findings = Array.isArray(data.security?.findings) ? data.security.findings.length : null;
  const deps = Array.isArray(data.dependencies?.list) ? data.dependencies.list.length : null;
  const metricItems = [
    ['Project type', data.projectType],
    ['Framework', data.framework],
    ['Quality score', score == null ? null : `${score}/100`],
    ['Security findings', findings],
    ['Dependencies', deps],
    ['Files analyzed', data.filesAnalyzedCount]
  ];
  metricItems.forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'analysis-metric';
    appendResultElement(card, 'span', '', label);
    appendResultElement(card, 'strong', '', value);
    metrics.appendChild(card);
  });
  analysisResults.appendChild(metrics);

  if (Array.isArray(data.files) && data.files.length) {
    const files = document.createElement('details');
    files.className = 'analysis-files';
    appendResultElement(files, 'summary', '', `Root files detected (${data.files.length})`);
    const list = document.createElement('ul');
    data.files.slice(0, 20).forEach(file => appendResultElement(list, 'li', '', file));
    files.appendChild(list);
    analysisResults.appendChild(files);
  }
}

analyzerForm?.addEventListener('submit', async event => {
  event.preventDefault();
  analysisResults.hidden = true;
  analysisResults.replaceChildren();
  let repositoryUrl;
  try {
    repositoryUrl = normalizeGitHubRepositoryUrl(repositoryInput.value);
  } catch (error) {
    analyzerStatus.textContent = error.message;
    analyzerStatus.className = 'analyzer-status is-error';
    repositoryInput.focus();
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analyzing…';
  analyzerStatus.textContent = 'Connecting to RepoLens and inspecting the repository. This can take a little while.';
  analyzerStatus.className = 'analyzer-status is-loading';

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(`${REPO_LENS_API}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || payload.error || `Analysis failed (HTTP ${response.status}). Check that the repository is public and try again.`);
    }
    const data = payload.data || payload;
    if (!data.repo && !data.repositoryUrl && !data.projectType) {
      throw new Error(payload.message || 'The backend returned an unexpected response. Please try again.');
    }
    renderRepositoryAnalysis(data);
    analyzerStatus.textContent = 'Analysis finished successfully.';
    analyzerStatus.className = 'analyzer-status is-success';
    analysisResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'The analysis took too long. Please try again in a moment.'
      : error.message || 'Could not reach the RepoLens backend. Please try again.';
    analyzerStatus.textContent = message;
    analyzerStatus.className = 'analyzer-status is-error';
  } finally {
    window.clearTimeout(timeout);
    analyzeButton.disabled = false;
    analyzeButton.innerHTML = 'Analyze repository <span aria-hidden="true">→</span>';
  }
});
