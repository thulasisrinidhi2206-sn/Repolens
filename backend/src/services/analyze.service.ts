/**
 * RepoLens - Repository Analysis Orchestrator Service
 */

import crypto from 'crypto';
import { AnalyzeRepoData } from '@repolens/shared';
import { GitHubUrlValidatorService, ValidationResult } from './validator.service';
import { gitHubService, GitHubApiError } from './github.service';
import { ProjectDetectorService } from './detector.service';
import { demoDetectorService } from './demo-detector.service';
import { ArchitectureService } from './architecture.service';
import { QualityScorerService } from './quality-scorer.service';
import { SecurityScannerService } from './security-scanner.service';
import { DependencyScannerService } from './dependency-scanner.service';
import { AiReviewService } from './ai-review.service';
import { blobPathsFromGitTree, selectAnalysisSamplePaths } from './file-sampler.service';

const SAMPLE_CONTENT_CHAR_LIMIT = 8000;

export interface AnalyzeServiceResult {
  success: boolean;
  statusCode?: number;
  data?: AnalyzeRepoData;
  error?: string;
  errorType?: string;
}

export class AnalyzeService {
  /**
   * Performs full repository analysis using GitHub REST API, detectors, and evaluation services
   */
  public async analyzeRepository(rawUrl: string): Promise<AnalyzeServiceResult> {
    const startedAt = Date.now();

    // 1. Validate and parse GitHub repository URL
    const validation: ValidationResult = GitHubUrlValidatorService.validateAndParse(rawUrl);

    if (!validation.isValid || !validation.repo || !validation.normalizedUrl) {
      return {
        success: false,
        statusCode: 400,
        error: validation.error || 'Invalid GitHub repository URL provided.',
        errorType: 'INVALID_URL',
      };
    }

    const { owner, repo } = validation.repo;
    const analysisSessionId = crypto.randomUUID();

    try {
      // 2. Fetch Repository Metadata from GitHub API
      const metadata = await gitHubService.getRepositoryMetadata(owner, repo);
      const targetBranch = validation.repo.branch || metadata.defaultBranch;

      // 3. Fetch Root Contents Listing from GitHub API
      const rootItems = await gitHubService.getRootContents(owner, repo, targetBranch);
      const rootFileNames = rootItems.map(item => item.name);

      // 4. Fetch Configuration Files (package.json, requirements.txt, pyproject.toml) and README if present
      let packageJsonRaw: string | null = null;
      let pythonConfigRaw: string | null = null;
      let readmeContent: string | null = null;

      const fileSet = new Set(rootFileNames.map(f => f.toLowerCase()));

      const fetchTasks: Promise<void>[] = [];

      if (fileSet.has('package.json')) {
        fetchTasks.push(
          gitHubService.getFileRawContent(owner, repo, 'package.json', targetBranch).then(content => {
            packageJsonRaw = content;
          })
        );
      }

      if (fileSet.has('requirements.txt')) {
        fetchTasks.push(
          gitHubService.getFileRawContent(owner, repo, 'requirements.txt', targetBranch).then(content => {
            pythonConfigRaw = content;
          })
        );
      } else if (fileSet.has('pyproject.toml')) {
        fetchTasks.push(
          gitHubService.getFileRawContent(owner, repo, 'pyproject.toml', targetBranch).then(content => {
            pythonConfigRaw = content;
          })
        );
      }

      fetchTasks.push(
        gitHubService.fetchReadmeContent(owner, repo, targetBranch).then(content => {
          readmeContent = content;
        })
      );

      await Promise.all(fetchTasks);

      // 5. Recursive file tree (best-effort; fall back to root names)
      let allFilePaths = rootFileNames;
      try {
        const treeItems = await gitHubService.getGitTree(owner, repo, targetBranch, true);
        const blobPaths = blobPathsFromGitTree(treeItems);
        if (blobPaths.length > 0) {
          allFilePaths = blobPaths;
        }
      } catch (treeErr: unknown) {
        console.warn('[AnalyzeService] Recursive git tree unavailable; using root listing only:', treeErr);
      }

      // 6. Detect Project Type and Framework
      const detection = ProjectDetectorService.detect({
        rootFiles: rootFileNames,
        allFiles: allFilePaths,
        packageJsonRaw,
        pythonConfigRaw,
        metadata,
      });

      // 7. Detect Existing Live Demo & Deployment URLs
      const demo = await demoDetectorService.detectDemos({
        metadata,
        packageJsonRaw,
        readmeContent,
      });

      // 8. Sample source files for content-based scanners (best-effort)
      const samplePaths = selectAnalysisSamplePaths(allFilePaths);
      const fileContents = new Map<string, string>();
      let filesSkippedCount = 0;

      const sampleBatchSize = 4;
      for (let i = 0; i < samplePaths.length; i += sampleBatchSize) {
        const batch = samplePaths.slice(i, i + sampleBatchSize);
        await Promise.all(
          batch.map(async (filePath) => {
            try {
              const content = await gitHubService.getFileRawContent(owner, repo, filePath, targetBranch);
              if (content && content.trim().length > 0) {
                fileContents.set(filePath, content.slice(0, SAMPLE_CONTENT_CHAR_LIMIT));
              } else {
                filesSkippedCount += 1;
              }
            } catch {
              filesSkippedCount += 1;
            }
          })
        );
      }

      // 9. Evaluation services — omit a section if it throws; never invent results
      const dependencies = DependencyScannerService.scan(packageJsonRaw);

      const security = SecurityScannerService.scan({
        allFiles: allFilePaths,
        packageJsonRaw,
        fileContents,
      });

      const architecture = ArchitectureService.analyze({
        allFiles: allFilePaths,
        projectType: detection.projectType,
        framework: detection.framework,
      });

      let codeReview;
      try {
        codeReview = await AiReviewService.review({
          allFiles: allFilePaths,
          fileContents,
          projectType: detection.projectType,
          framework: detection.framework,
        });
      } catch (reviewErr: unknown) {
        console.warn('[AnalyzeService] Code review failed; omitting codeReview from response:', reviewErr);
      }

      const qualityScore = QualityScorerService.evaluate({
        metadata,
        projectType: detection.projectType,
        framework: detection.framework,
        rootFiles: rootFileNames,
        allFiles: allFilePaths,
        packageJsonRaw,
        readmeContent,
        securityFindings: security.findings,
        dependencies: dependencies.list,
      });

      const analysisDurationMs = Date.now() - startedAt;

      const responseData: AnalyzeRepoData = {
        id: analysisSessionId,
        repo: {
          owner,
          repo,
          branch: targetBranch,
        },
        repository: metadata,
        projectType: detection.projectType,
        framework: detection.framework,
        files: rootFileNames,
        confidence: detection.confidence,
        demo,
        details: detection.details,
        status: 'completed',
        repositoryUrl: validation.normalizedUrl,
        receivedAt: new Date().toISOString(),
        message: `Repository analysis completed for ${owner}/${repo}. Detected: ${detection.projectType} (${detection.framework}). Quality ${qualityScore.overallScore}/100 (${qualityScore.grade}).${demo.hasDemo ? ` Found live demo: ${demo.primaryDemoUrl}` : ''}`,
        metrics: {
          overallScore: qualityScore.overallScore,
          summary: qualityScore.summary,
          qualityScore,
        },
        security: {
          score: security.score,
          findings: security.findings,
          exposedSecretsCount: security.exposedSecretsCount,
        },
        dependencies,
        architecture,
        ...(codeReview ? { codeReview } : {}),
        analysisDurationMs,
        filesAnalyzedCount: fileContents.size,
        filesSkippedCount,
      };

      return {
        success: true,
        statusCode: 200,
        data: responseData,
      };
    } catch (err: unknown) {
      if (err instanceof GitHubApiError) {
        return {
          success: false,
          statusCode: err.statusCode,
          error: err.message,
          errorType: err.errorType,
        };
      }

      const unexpectedMsg = err instanceof Error ? err.message : 'Unexpected analysis failure';
      console.error('[AnalyzeService] Unexpected error during repository analysis:', err);
      return {
        success: false,
        statusCode: 500,
        error: `Internal server error while analyzing repository: ${unexpectedMsg}`,
        errorType: 'INTERNAL_ERROR',
      };
    }
  }
}

export const analyzeService = new AnalyzeService();
