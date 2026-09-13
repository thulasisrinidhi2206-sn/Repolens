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
 * Detected project types
 */
export type ProjectType =
  | 'HTML/CSS/JavaScript'
  | 'React'
  | 'Vite'
  | 'Node.js'
  | 'Next.js'
  | 'Python'
  | 'Unknown';

/**
 * Structured GitHub repository metadata
 */
export interface RepositoryMetadata {
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  url: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  isPrivate?: boolean;
}

/**
 * Structured repository analysis result
 */
export interface RepositoryAnalysisResult {
  id?: string;
  repository: RepositoryMetadata;
  projectType: ProjectType;
  framework: string;
  files: string[];
  confidence: number;
  details?: {
    packageJson?: {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    detectedConfigs?: string[];
    mainLanguage?: string | null;
  };
}

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
 * Request payload for POST /api/analyze
 */
export interface AnalyzeRepoRequest {
  repositoryUrl: string;
}

/**
 * Result payload returned from POST /api/analyze
 */
export interface AnalyzeRepoData extends RepositoryAnalysisResult {
  id: string;
  repo: RepoIdentifier;
  status: EvaluationStatus;
  repositoryUrl: string;
  receivedAt: string;
  message: string;
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
