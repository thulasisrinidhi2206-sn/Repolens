/**
 * RepoLens - Extension Content Script Types
 */

export interface RepoInfo {
  owner: string;
  repo: string;
  fullRepo: string; // "owner/repo"
  branch?: string;
  subPath?: string;
  url: string;
}

export type InjectionStatus = 'unmounted' | 'mounting' | 'mounted' | 'failed';

export interface PreviewButtonOptions {
  onPreviewClick: (repo: RepoInfo) => void;
  className?: string;
  size?: 'small' | 'medium';
}
