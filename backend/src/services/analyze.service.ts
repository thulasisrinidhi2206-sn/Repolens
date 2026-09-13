/**
 * RepoLens - Repository Analysis Orchestrator Service
 */

import crypto from 'crypto';
import { AnalyzeRepoData } from '@repolens/shared';
import { GitHubUrlValidatorService, ValidationResult } from './validator.service';
import { gitHubService, GitHubApiError } from './github.service';
import { ProjectDetectorService } from './detector.service';
import { demoDetectorService } from './demo-detector.service';

export interface AnalyzeServiceResult {
  success: boolean;
  statusCode?: number;
  data?: AnalyzeRepoData;
  error?: string;
  errorType?: string;
}

export class AnalyzeService {
  /**
   * Performs full repository analysis using GitHub REST API, ProjectDetector, and DemoDetector
   */
  public async analyzeRepository(rawUrl: string): Promise<AnalyzeServiceResult> {
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

      // 3. Fetch Root Contents Listing from GitHub API
      const rootItems = await gitHubService.getRootContents(owner, repo, metadata.defaultBranch);
      const rootFileNames = rootItems.map(item => item.name);

      // 4. Fetch Configuration Files (package.json, requirements.txt, pyproject.toml) and README if present
      let packageJsonRaw: string | null = null;
      let pythonConfigRaw: string | null = null;
      let readmeContent: string | null = null;

      const fileSet = new Set(rootFileNames.map(f => f.toLowerCase()));

      const fetchTasks: Promise<void>[] = [];

      if (fileSet.has('package.json')) {
        fetchTasks.push(
          gitHubService.getFileRawContent(owner, repo, 'package.json', metadata.defaultBranch).then(content => {
            packageJsonRaw = content;
          })
        );
      }

      if (fileSet.has('requirements.txt')) {
        fetchTasks.push(
          gitHubService.getFileRawContent(owner, repo, 'requirements.txt', metadata.defaultBranch).then(content => {
            pythonConfigRaw = content;
          })
        );
      } else if (fileSet.has('pyproject.toml')) {
        fetchTasks.push(
          gitHubService.getFileRawContent(owner, repo, 'pyproject.toml', metadata.defaultBranch).then(content => {
            pythonConfigRaw = content;
          })
        );
      }

      // Fetch README content
      fetchTasks.push(
        gitHubService.fetchReadmeContent(owner, repo, metadata.defaultBranch).then(content => {
          readmeContent = content;
        })
      );

      await Promise.all(fetchTasks);

      // 5. Detect Project Type and Framework
      const detection = ProjectDetectorService.detect({
        rootFiles: rootFileNames,
        packageJsonRaw,
        pythonConfigRaw,
        metadata,
      });

      // 6. Detect Existing Live Demo & Deployment URLs
      const demo = await demoDetectorService.detectDemos({
        metadata,
        packageJsonRaw,
        readmeContent,
      });

      // 7. Build structured response conforming to specification
      const responseData: AnalyzeRepoData = {
        id: analysisSessionId,
        repo: {
          owner,
          repo,
          branch: metadata.defaultBranch,
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
        message: `Repository analysis completed for ${owner}/${repo}. Detected: ${detection.projectType} (${detection.framework}).${demo.hasDemo ? ` Found live demo: ${demo.primaryDemoUrl}` : ''}`,
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
