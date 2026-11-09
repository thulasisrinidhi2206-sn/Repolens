/**
 * RepoLens - Browser download helpers for Markdown and PDF reports
 */

import { AnalyzeRepoData, buildMarkdownReport, buildPdfReport, reportBasename } from '@repolens/shared';

export { buildMarkdownReport, buildPdfReport, reportBasename };

export function downloadBinaryFile(filename: string, contents: Uint8Array | string, mimeType: string): void {
  const blobContents = typeof contents === 'string' ? contents : new Uint8Array(contents);
  const blob = new Blob([blobContents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadMarkdownReport(data: AnalyzeRepoData): void {
  downloadBinaryFile(`${reportBasename(data)}.md`, buildMarkdownReport(data), 'text/markdown;charset=utf-8');
}

export function downloadPdfReport(data: AnalyzeRepoData): void {
  downloadBinaryFile(`${reportBasename(data)}.pdf`, buildPdfReport(data), 'application/pdf');
}
