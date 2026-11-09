/**
 * RepoLens - Markdown and PDF report builders from AnalyzeRepoData
 */

import type { AnalyzeRepoData, FindingSeverity } from './index';

function severityLabel(severity: FindingSeverity | undefined): string {
  return severity || 'Info';
}

/**
 * Builds a Markdown report exclusively from API analysis data.
 */
export function buildMarkdownReport(data: AnalyzeRepoData): string {
  const quality = data.metrics?.qualityScore;
  const lines: string[] = [];

  lines.push('# RepoLens Analysis Report');
  lines.push('');
  lines.push(`- **Repository:** ${data.repository?.fullName || `${data.repo.owner}/${data.repo.repo}`}`);
  lines.push(`- **URL:** ${data.repositoryUrl}`);
  lines.push(`- **Branch:** ${data.repo.branch || data.repository?.defaultBranch || 'unknown'}`);
  lines.push(`- **Analyzed at:** ${data.receivedAt}`);
  lines.push(`- **Project type:** ${data.projectType}`);
  lines.push(`- **Framework:** ${data.framework}`);
  if (typeof data.analysisDurationMs === 'number') {
    lines.push(`- **Duration:** ${data.analysisDurationMs} ms`);
  }
  if (typeof data.filesAnalyzedCount === 'number') {
    lines.push(`- **Source files sampled:** ${data.filesAnalyzedCount}`);
  }
  lines.push('');

  lines.push('## Quality score');
  if (!quality) {
    lines.push('Quality score was not included in this analysis response.');
  } else {
    lines.push(`**${quality.overallScore}/100 (${quality.grade})**`);
    lines.push('');
    lines.push(quality.summary);
    lines.push('');
    lines.push(quality.methodology);
    lines.push('');
    lines.push('| Category | Score | Weight | Deductions |');
    lines.push('| --- | --- | --- | --- |');
    for (const category of Object.values(quality.categories)) {
      const deductions = category.deductions.length
        ? category.deductions.map(d => `${d.reason} (-${d.points})`).join('; ')
        : 'None';
      lines.push(`| ${category.name} | ${category.score} | ${Math.round(category.weight * 100)}% | ${deductions} |`);
    }
    if (quality.keyStrengths.length) {
      lines.push('');
      lines.push('**Strengths**');
      quality.keyStrengths.forEach(item => lines.push(`- ${item}`));
    }
    if (quality.keyImprovements.length) {
      lines.push('');
      lines.push('**Improvements**');
      quality.keyImprovements.forEach(item => lines.push(`- ${item}`));
    }
  }
  lines.push('');

  lines.push('## Live demo');
  if (data.demo?.hasDemo && data.demo.primaryDemoUrl) {
    lines.push(`Detected: ${data.demo.primaryDemoUrl}`);
  } else {
    lines.push('No live demo URL was detected in repository metadata or README.');
  }
  lines.push('');

  lines.push('## Architecture');
  if (!data.architecture) {
    lines.push('Architecture analysis was not included in this analysis response.');
  } else {
    const arch = data.architecture;
    lines.push(`- Files: ${arch.totalFilesCount}`);
    lines.push(`- Directories: ${arch.totalDirectoriesCount}`);
    lines.push(`- Entry points: ${arch.entryPoints.join(', ') || 'none detected'}`);
    lines.push(`- Config files: ${arch.configFiles.join(', ') || 'none detected'}`);
    lines.push('');
    if (arch.majorModules.length === 0) {
      lines.push('No major modules were inferred from the file tree.');
    } else {
      arch.majorModules.forEach(mod => {
        lines.push(`- **${mod.path}** — ${mod.role} (${mod.fileCount} files)`);
      });
    }
    if (arch.mermaidDiagram) {
      lines.push('');
      lines.push('```mermaid');
      lines.push(arch.mermaidDiagram);
      lines.push('```');
    }
  }
  lines.push('');

  lines.push('## Security');
  if (!data.security) {
    lines.push('Security scan was not included in this analysis response.');
  } else if (data.security.findings.length === 0) {
    lines.push(`Score ${data.security.score}/100. No security findings in scanned paths and sampled files.`);
  } else {
    lines.push(`Score ${data.security.score}/100. Exposed-secret indicators: ${data.security.exposedSecretsCount}.`);
    lines.push('');
    data.security.findings.forEach(finding => {
      const location = finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ''})` : '';
      lines.push(`- **[${severityLabel(finding.severity)}]** ${finding.title}${location}`);
      lines.push(`  ${finding.description}`);
      lines.push(`  Recommendation: ${finding.recommendation}`);
    });
  }
  lines.push('');

  lines.push('## Dependencies');
  if (!data.dependencies) {
    lines.push('Dependency scan was not included in this analysis response.');
  } else if (data.dependencies.totalCount === 0) {
    lines.push('No package.json dependencies were found.');
  } else {
    const deps = data.dependencies;
    lines.push(`Total ${deps.totalCount}. Vulnerable: ${deps.vulnerableCount}. Unpinned or deprecated: ${deps.outdatedCount}.`);
    lines.push('');
    const notable = deps.list.filter(item => item.isVulnerable || item.isOutdated);
    if (notable.length === 0) {
      lines.push('No known-advisory or unpinned dependencies were flagged. This scanner uses an offline advisory list, not a live vulnerability database.');
    } else {
      notable.forEach(item => {
        const flags = [
          item.isVulnerable ? 'vulnerable' : '',
          item.isOutdated ? 'outdated/unpinned' : '',
        ].filter(Boolean).join(', ');
        lines.push(`- **${item.name}** ${item.currentVersion} (${item.type}, ${flags})`);
        if (item.recommendation) lines.push(`  ${item.recommendation}`);
      });
    }
  }
  lines.push('');

  lines.push('## Code review');
  if (!data.codeReview) {
    lines.push('Code review was not included in this analysis response.');
  } else {
    const review = data.codeReview;
    lines.push(`Engine: ${review.engine}${review.isAiPowered ? ' (AI-powered)' : ' (static analyzer)'}.`);
    lines.push('');
    lines.push(review.summary);
    lines.push('');
    if (review.findings.length === 0) {
      lines.push('No code-review findings were reported for sampled files.');
    } else {
      review.findings.forEach(finding => {
        lines.push(`- **[${severityLabel(finding.severity)}]** ${finding.title} (${finding.file}${finding.line ? `:${finding.line}` : ''})`);
        lines.push(`  ${finding.explanation}`);
        if (finding.suggestedFix) {
          lines.push('  Suggested fix:');
          lines.push('  ```');
          lines.push(`  ${finding.suggestedFix}`);
          lines.push('  ```');
        }
      });
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('Generated by RepoLens from the analysis API response. Scores are heuristic and not a substitute for a professional audit.');

  return lines.join('\n');
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function toPdfSafe(text: string): string {
  return text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, (ch) => {
    const map: Record<string, string> = {
      '—': '-',
      '–': '-',
      '’': "'",
      '‘': "'",
      '“': '"',
      '”': '"',
      '•': '-',
      '⭐': '*',
    };
    return map[ch] || '?';
  });
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const words = line.split(/\s+/);
  const rows: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
    } else {
      if (current) rows.push(current);
      if (word.length > width) {
        for (let i = 0; i < word.length; i += width) {
          rows.push(word.slice(i, i + width));
        }
        current = '';
      } else {
        current = word;
      }
    }
  }
  if (current) rows.push(current);
  return rows;
}

function escapePdfString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Builds a simple multi-page PDF (Helvetica) from the Markdown report text.
 */
export function buildPdfReport(data: AnalyzeRepoData): Uint8Array {
  const markdown = toPdfSafe(buildMarkdownReport(data));
  const wrapped: string[] = [];
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.replace(/\t/g, '  ');
    wrapped.push(...wrapLine(line.length ? line : ' ', 92));
  }

  const linesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['(empty report)']);

  const objects: string[] = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');

  const pageIds: number[] = [];
  const contentIds: number[] = [];
  let nextId = 3;
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(nextId++);
    contentIds.push(nextId++);
  }
  const fontId = nextId;

  const kids = pageIds.map(id => `${id} 0 R`).join(' ');
  objects.push(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages.length} >> endobj`);

  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = contentIds[index];
    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >> endobj`
    );

    const streamLines = ['BT', '/F1 10 Tf', '14 TL', '72 720 Td'];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) streamLines.push('T*');
      streamLines.push(`(${escapePdfString(line)}) Tj`);
    });
    streamLines.push('ET');
    const stream = streamLines.join('\n');
    objects.push(`${contentId} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`);
  });

  objects.push(`${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(obj => {
    offsets.push(utf8ByteLength(pdf));
    pdf += `${obj}\n`;
  });

  const xrefOffset = utf8ByteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function reportBasename(data: AnalyzeRepoData): string {
  const stamp = data.receivedAt.slice(0, 10);
  return `repolens-${data.repo.owner}-${data.repo.repo}-${stamp}`;
}
