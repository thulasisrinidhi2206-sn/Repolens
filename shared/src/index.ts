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
  projectType?: ProjectType;
  framework?: string;
  previewUrl?: string;
  containerId?: string;
  port?: number;
  expiresAt?: string;
  logs?: string[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

/**
 * Static preview eligibility evaluation result
 */
export interface StaticPreviewEligibility {
  isEligible: boolean;
  reason?: string;
  entryFile?: string;
  staticFilesCount?: number;
  projectType?: ProjectType;
}

/**
 * Request payload for POST /api/preview
 */
export interface CreatePreviewRequest {
  repositoryUrl: string;
}

/**
 * Result payload returned from POST /api/preview
 */
export interface CreatePreviewData extends ProjectPreview {
  repositoryUrl: string;
  message: string;
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
  homepage?: string | null;
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
 * Sources where a demo URL was discovered
 */
export type DemoSource =
  | 'metadata_homepage'
  | 'package_json'
  | 'readme_badge'
  | 'readme_link'
  | 'readme_text';

/**
 * Live demo URL candidate descriptor
 */
export interface DemoUrlCandidate {
  url: string;
  source: DemoSource;
  confidence: number;
  domain?: string;
  description?: string;
  isValidated?: boolean;
  isReachable?: boolean;
  statusCode?: number;
}

/**
 * Result of existing demo detection
 */
export interface DemoDetectionResult {
  hasDemo: boolean;
  primaryDemoUrl: string | null;
  candidates: DemoUrlCandidate[];
}

/**
 * Severity level for code review, security, and quality findings
 */
export type FindingSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

/**
 * Detailed code deduction entry explaining why points were deducted
 */
export interface ScoreDeduction {
  reason: string;
  points: number;
}

/**
 * Individual category score breakdown for code quality scoring
 */
export interface ScoreCategory {
  name: string;
  score: number; // 0 to 100
  weight: number; // e.g. 0.20 (20%)
  deductions: ScoreDeduction[];
}

/**
 * Transparent repository quality score metrics
 */
export interface QualityScoreMetrics {
  overallScore: number; // 0 to 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  categories: {
    codeOrganization: ScoreCategory;
    maintainability: ScoreCategory;
    documentation: ScoreCategory;
    testCoverage: ScoreCategory;
    dependencyHealth: ScoreCategory;
    security: ScoreCategory;
  };
  methodology: string;
  summary: string;
  keyStrengths: string[];
  keyImprovements: string[];
}

/**
 * Security scanner finding
 */
export interface SecurityFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  category: 'secret_exposure' | 'unsafe_config' | 'dependency_vulnerability' | 'injection_risk' | 'file_permission';
  description: string;
  file?: string;
  line?: number;
  recommendation: string;
  isConfirmed: boolean; // Distinguishes confirmed issues from heuristic warnings
}

/**
 * Dependency item descriptor
 */
export interface DependencyItem {
  name: string;
  currentVersion: string;
  type: 'dependency' | 'devDependency' | 'peerDependency';
  isOutdated?: boolean;
  isVulnerable?: boolean;
  vulnerabilityCount?: number;
  advisories?: string[];
  recommendation?: string;
}

/**
 * Project architecture component / module
 */
export interface ArchitectureModule {
  name: string;
  path: string;
  role: string;
  fileCount: number;
  technologies?: string[];
}

/**
 * Project architecture visualization info
 */
export interface ProjectArchitectureInfo {
  majorModules: ArchitectureModule[];
  configFiles: string[];
  entryPoints: string[];
  totalFilesCount: number;
  totalDirectoriesCount: number;
  mermaidDiagram?: string;
}

/**
 * Code review finding item
 */
export interface CodeReviewFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  file: string;
  line?: number;
  category: 'bug' | 'code_smell' | 'maintainability' | 'security' | 'performance';
  explanation: string;
  codeSnippet?: string;
  suggestedFix?: string;
  source: 'ai' | 'static_analyzer';
}

/**
 * AI Code Review report summary
 */
export interface CodeReviewReport {
  isAiPowered: boolean;
  engine: string;
  summary: string;
  findings: CodeReviewFinding[];
}

/**
 * Project evaluation score metrics (legacy & modern compatibility)
 */
export interface EvaluationMetrics {
  codeQualityScore?: number;
  documentationScore?: number;
  maintainabilityScore?: number;
  securityScore?: number;
  overallScore?: number;
  summary?: string;
  insights?: string[];
  qualityScore?: QualityScoreMetrics;
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
  demo?: DemoDetectionResult;
  details?: {
    packageJson?: {
      name?: string;
      version?: string;
      homepage?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    detectedConfigs?: string[];
    mainLanguage?: string | null;
  };
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
  metrics?: EvaluationMetrics;
  security?: {
    score: number;
    findings: SecurityFinding[];
    exposedSecretsCount: number;
  };
  dependencies?: {
    totalCount: number;
    list: DependencyItem[];
    vulnerableCount: number;
    outdatedCount: number;
  };
  architecture?: ProjectArchitectureInfo;
  codeReview?: CodeReviewReport;
  analysisDurationMs?: number;
  filesAnalyzedCount?: number;
  filesSkippedCount?: number;
}

/**
 * Request payload for POST /api/analyze
 */
export interface AnalyzeRepoRequest {
  repositoryUrl: string;
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
