/**
 * RepoLens - Source file sampler for evaluation (security, review)
 * Selects a small, high-signal subset of repository paths without downloading the full tree.
 */

const SKIP_PATH = /(^|\/)(node_modules|dist|build|\.git|vendor|coverage|\.next|out|tmp|\.cache)(\/|$)/i;

const SAMPLE_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|py|html)$/i;

const PRIORITY_PATH = /(^|\/)(index|main|app|server)\.(ts|tsx|js|jsx|mjs|cjs|py)$/i;

const SENSITIVE_PATH = /(^|\/)(\.env(\..+)?$|credentials\.json$|.*\.(pem|key)$)/i;

export const DEFAULT_SAMPLE_FILE_LIMIT = 8;

/**
 * Picks representative source and sensitive files for content-based scanners.
 */
export function selectAnalysisSamplePaths(
  allFiles: string[],
  maxFiles: number = DEFAULT_SAMPLE_FILE_LIMIT
): string[] {
  const normalized = allFiles
    .map(f => f.replace(/\\/g, '/').replace(/^\/+/, ''))
    .filter(f => f.length > 0 && !SKIP_PATH.test(f));

  const sensitive = normalized.filter(f => SENSITIVE_PATH.test(f));
  const priority = normalized.filter(f => PRIORITY_PATH.test(f));
  const rest = normalized.filter(f => SAMPLE_EXTENSION.test(f) && !PRIORITY_PATH.test(f));

  const picked: string[] = [];
  const seen = new Set<string>();

  for (const path of [...sensitive.slice(0, 3), ...priority, ...rest]) {
    if (seen.has(path)) continue;
    seen.add(path);
    picked.push(path);
    if (picked.length >= maxFiles) break;
  }

  return picked;
}

/**
 * Returns blob (file) paths from a Git tree listing, excluding directories.
 */
export function blobPathsFromGitTree(
  treeItems: { path: string; type: 'blob' | 'tree' }[]
): string[] {
  return treeItems.filter(item => item.type === 'blob' && item.path).map(item => item.path);
}
