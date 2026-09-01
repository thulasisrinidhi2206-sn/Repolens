/**
 * RepoLens Content Script (injected into GitHub repository pages)
 */

console.log('[RepoLens] Content script loaded on GitHub page:', window.location.href);

// Placeholder function to parse current repository details from URL
export function parseGitHubRepoFromUrl(url: string = window.location.href) {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2]
  };
}

const repoInfo = parseGitHubRepoFromUrl();
if (repoInfo) {
  console.log(`[RepoLens] Detected repository: ${repoInfo.owner}/${repoInfo.repo}`);
}
