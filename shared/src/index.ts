/**
 * RepoLens - Shared Models & Types
 */

/**
 * Identifier for a target GitHub repository
 */
export interface RepoIdentifier {
  owner: string;
  repo: string;
  branch?: string;
  commit?: string;
}

/**
 * Lifecycle status of a project visual preview
 */
export type PreviewStatus = 'idle' | 'queued' | 'building' | 'running' | 'ready' | 'failed' | 'stopped';

/**
 * Visual preview session descriptor
 */
export interface ProjectPreview {
  id: string;
  repo: RepoIdentifier;
  status: PreviewStatus;
  previewUrl?: string;
  logs?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Lifecycle status of a project evaluation analysis
 */
export type EvaluationStatus = 'idle' | 'analyzing' | 'completed' | 'failed';

/**
 * Project evaluation score metrics
 */
export interface EvaluationMetrics {
  codeQualityScore?: number;
  documentationScore?: number;
  maintainabilityScore?: number;
  securityScore?: number;
  overallScore?: number;
  summary?: string;
  insights?: string[];
}

/**
 * Project evaluation report descriptor
 */
export interface ProjectEvaluation {
  id: string;
  repo: RepoIdentifier;
  status: EvaluationStatus;
  metrics?: EvaluationMetrics;
  createdAt: string;
  updatedAt: string;
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}
