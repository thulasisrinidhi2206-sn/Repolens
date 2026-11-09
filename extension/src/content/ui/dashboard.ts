/**
 * RepoLens - Analysis dashboard sections rendered from API data only
 */

import { AnalyzeRepoData, FindingSeverity } from '@repolens/shared';
import { escapeHtml } from './html';

function severityClass(severity: FindingSeverity): string {
  const key = severity.toLowerCase().replace('+', '');
  return `repolens-sev-${key}`;
}

function scoreBar(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  return `<div class="repolens-score-bar" role="meter" aria-valuenow="${clamped}" aria-valuemin="0" aria-valuemax="100"><span style="width:${clamped}%"></span></div>`;
}

function emptyState(message: string): string {
  return `<p class="repolens-empty-state">${escapeHtml(message)}</p>`;
}

function qualitySection(data: AnalyzeRepoData): string {
  const quality = data.metrics?.qualityScore;
  if (!quality) {
    return `
      <section class="repolens-dash-section">
        <h3 class="repolens-dash-heading">Quality score</h3>
        ${emptyState('Quality score was not included in this analysis response.')}
      </section>`;
  }

  const categories = Object.values(quality.categories)
    .map(category => {
      const deductions = category.deductions.length
        ? category.deductions.map(d => `<li>${escapeHtml(d.reason)} (−${d.points})</li>`).join('')
        : '<li class="muted">No deductions</li>';
      return `
        <div class="repolens-category-row">
          <div class="repolens-category-head">
            <span>${escapeHtml(category.name)}</span>
            <span>${category.score}/100</span>
          </div>
          ${scoreBar(category.score)}
          <ul class="repolens-deduction-list">${deductions}</ul>
        </div>`;
    })
    .join('');

  const strengths = quality.keyStrengths.length
    ? quality.keyStrengths.map(item => `<li>${escapeHtml(item)}</li>`).join('')
    : '<li class="muted">None recorded for this scan</li>';
  const improvements = quality.keyImprovements.length
    ? quality.keyImprovements.map(item => `<li>${escapeHtml(item)}</li>`).join('')
    : '<li class="muted">None recorded for this scan</li>';

  return `
    <section class="repolens-dash-section">
      <h3 class="repolens-dash-heading">Quality score</h3>
      <div class="repolens-grade-row">
        <div class="repolens-grade-badge">${escapeHtml(quality.grade)}</div>
        <div>
          <div class="repolens-grade-score">${quality.overallScore}/100</div>
          ${scoreBar(quality.overallScore)}
        </div>
      </div>
      <p class="repolens-dash-copy">${escapeHtml(quality.summary)}</p>
      <p class="repolens-dash-meta">${escapeHtml(quality.methodology)}</p>
      ${categories}
      <div class="repolens-two-col">
        <div>
          <h4 class="repolens-subhead">Strengths</h4>
          <ul>${strengths}</ul>
        </div>
        <div>
          <h4 class="repolens-subhead">Improvements</h4>
          <ul>${improvements}</ul>
        </div>
      </div>
    </section>`;
}

function architectureSection(data: AnalyzeRepoData): string {
  const arch = data.architecture;
  if (!arch) {
    return `
      <section class="repolens-dash-section">
        <h3 class="repolens-dash-heading">Architecture</h3>
        ${emptyState('Architecture analysis was not included in this analysis response.')}
      </section>`;
  }

  const modules = arch.majorModules.length
    ? arch.majorModules
        .map(
          mod =>
            `<li><strong>${escapeHtml(mod.path)}</strong> — ${escapeHtml(mod.role)} <span class="muted">(${mod.fileCount} files)</span></li>`
        )
        .join('')
    : '<li class="muted">No major modules were inferred from the file tree.</li>';

  return `
    <section class="repolens-dash-section">
      <h3 class="repolens-dash-heading">Architecture</h3>
      <div class="repolens-analysis-summary-card">
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Files</span>
          <span class="repolens-summary-val">${arch.totalFilesCount}</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Directories</span>
          <span class="repolens-summary-val">${arch.totalDirectoriesCount}</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Entry points</span>
          <span class="repolens-summary-val">${escapeHtml(arch.entryPoints.join(', ') || 'None detected')}</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Config files</span>
          <span class="repolens-summary-val">${escapeHtml(arch.configFiles.join(', ') || 'None detected')}</span>
        </div>
      </div>
      <h4 class="repolens-subhead">Modules</h4>
      <ul class="repolens-module-list">${modules}</ul>
      ${
        arch.mermaidDiagram
          ? `<pre class="repolens-mermaid">${escapeHtml(arch.mermaidDiagram)}</pre>`
          : ''
      }
    </section>`;
}

function securitySection(data: AnalyzeRepoData): string {
  const security = data.security;
  if (!security) {
    return `
      <section class="repolens-dash-section">
        <h3 class="repolens-dash-heading">Security</h3>
        ${emptyState('Security scan was not included in this analysis response.')}
      </section>`;
  }

  const findings = security.findings.length
    ? security.findings
        .map(finding => {
          const loc = finding.file
            ? `${finding.file}${finding.line ? `:${finding.line}` : ''}`
            : '';
          return `
            <article class="repolens-finding ${severityClass(finding.severity)}">
              <div class="repolens-finding-title">
                <span class="repolens-sev-pill">${escapeHtml(finding.severity)}</span>
                ${escapeHtml(finding.title)}
              </div>
              ${loc ? `<div class="repolens-finding-file">${escapeHtml(loc)}</div>` : ''}
              <p>${escapeHtml(finding.description)}</p>
              <p class="repolens-finding-rec">${escapeHtml(finding.recommendation)}</p>
            </article>`;
        })
        .join('')
    : emptyState('No security findings in scanned paths and sampled files.');

  return `
    <section class="repolens-dash-section">
      <h3 class="repolens-dash-heading">Security</h3>
      <div class="repolens-grade-row compact">
        <div class="repolens-grade-score">${security.score}/100</div>
        <span class="muted">Secret indicators: ${security.exposedSecretsCount}</span>
      </div>
      ${scoreBar(security.score)}
      ${findings}
    </section>`;
}

function dependencySection(data: AnalyzeRepoData): string {
  const deps = data.dependencies;
  if (!deps) {
    return `
      <section class="repolens-dash-section">
        <h3 class="repolens-dash-heading">Dependencies</h3>
        ${emptyState('Dependency scan was not included in this analysis response.')}
      </section>`;
  }

  if (deps.totalCount === 0) {
    return `
      <section class="repolens-dash-section">
        <h3 class="repolens-dash-heading">Dependencies</h3>
        ${emptyState('No package.json dependencies were found.')}
      </section>`;
  }

  const notable = deps.list.filter(item => item.isVulnerable || item.isOutdated);
  const notableHtml = notable.length
    ? notable
        .map(item => {
          const flags = [
            item.isVulnerable ? 'vulnerable' : '',
            item.isOutdated ? 'unpinned/deprecated' : '',
          ]
            .filter(Boolean)
            .join(', ');
          return `<li><strong>${escapeHtml(item.name)}</strong> ${escapeHtml(item.currentVersion)} <span class="muted">(${escapeHtml(item.type)}, ${escapeHtml(flags)})</span>${
            item.recommendation ? `<div class="repolens-finding-rec">${escapeHtml(item.recommendation)}</div>` : ''
          }</li>`;
        })
        .join('')
    : '<li class="muted">No known-advisory or unpinned dependencies were flagged. Offline advisory list only — not a live CVE database.</li>';

  return `
    <section class="repolens-dash-section">
      <h3 class="repolens-dash-heading">Dependencies</h3>
      <div class="repolens-analysis-summary-card">
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Total</span>
          <span class="repolens-summary-val">${deps.totalCount}</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Vulnerable</span>
          <span class="repolens-summary-val">${deps.vulnerableCount}</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Unpinned / deprecated</span>
          <span class="repolens-summary-val">${deps.outdatedCount}</span>
        </div>
      </div>
      <ul class="repolens-module-list">${notableHtml}</ul>
    </section>`;
}

function reviewSection(data: AnalyzeRepoData): string {
  const review = data.codeReview;
  if (!review) {
    return `
      <section class="repolens-dash-section">
        <h3 class="repolens-dash-heading">Code review</h3>
        ${emptyState('Code review was not included in this analysis response.')}
      </section>`;
  }

  const findings = review.findings.length
    ? review.findings
        .map(finding => {
          const loc = `${finding.file}${finding.line ? `:${finding.line}` : ''}`;
          return `
            <article class="repolens-finding ${severityClass(finding.severity)}">
              <div class="repolens-finding-title">
                <span class="repolens-sev-pill">${escapeHtml(finding.severity)}</span>
                ${escapeHtml(finding.title)}
              </div>
              <div class="repolens-finding-file">${escapeHtml(loc)} · ${escapeHtml(finding.source)}</div>
              <p>${escapeHtml(finding.explanation)}</p>
              ${
                finding.suggestedFix
                  ? `<pre class="repolens-code">${escapeHtml(finding.suggestedFix)}</pre>`
                  : ''
              }
            </article>`;
        })
        .join('')
    : emptyState('No code-review findings were reported for sampled files.');

  return `
    <section class="repolens-dash-section">
      <h3 class="repolens-dash-heading">Code review</h3>
      <p class="repolens-dash-meta">${escapeHtml(review.engine)}${review.isAiPowered ? ' · AI-powered' : ' · static analyzer'}</p>
      <p class="repolens-dash-copy">${escapeHtml(review.summary)}</p>
      ${findings}
    </section>`;
}

export function renderDashboardSections(data: AnalyzeRepoData): string {
  const sampled =
    typeof data.filesAnalyzedCount === 'number'
      ? `<p class="repolens-dash-meta">Sampled ${data.filesAnalyzedCount} source file(s) for content scanners${
          typeof data.analysisDurationMs === 'number' ? ` · ${data.analysisDurationMs} ms` : ''
        }</p>`
      : '';

  return `
    ${sampled}
    ${qualitySection(data)}
    ${architectureSection(data)}
    ${securitySection(data)}
    ${dependencySection(data)}
    ${reviewSection(data)}
  `;
}
