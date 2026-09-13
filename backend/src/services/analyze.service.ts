/**
 * RepoLens - Repository Analysis Orchestrator Service
 */

import crypto from 'crypto';
import { AnalyzeRepoData } from '@repolens/shared';
import { GitHubUrlValidatorService, ValidationResult } from './validator.service';
import { gitHubService, GitHubApiError } from './github.service';
import { ProjectDetectorService } from './detector.service';

export interface AnalyzeServiceResult {
  success: boolean;
  statusCode?: number;
  data?: AnalyzeRepoData;
  error?: string;
  errorType?: string;
}

export class AnalyzeService {
  /**
   * Performs full repository analysis using GitHub REST API and ProjectDetector
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

      // 4. Fetch Configuration Files (package.json, requirements.txt, pyproject.toml) if present
      let packageJsonRaw: string | null = null;
      let pythonConfigRaw: string | null = null;

      const fileSet = new Set(rootFileNames.map(f => f.toLowerCase()));

      if (fileSet.has('package.json')) {
        packageJsonRaw = await gitHubService.getFileRawContent(owner, repo, 'package.json', metadata.defaultBranch);
      }

      if (fileSet.has('requirements.txt')) {
        pythonConfigRaw = await gitHubService.getFileRawContent(owner, repo, 'requirements.txt', metadata.defaultBranch);
      } else if (fileSet.has('pyproject.toml')) {
        pythonConfigRaw = await gitHubService.getFileRawContent(owner, repo, 'pyproject.toml', metadata.defaultBranch);
      }

      // 5. Detect Project Type and Framework
      const detection = ProjectDetectorService.detect({
        rootFiles: rootFileNames,
        packageJsonRaw,
        pythonConfigRaw,
        metadata,
      });

      // 6. Build structured response conforming to specification
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
        details: detection.details,
        status: 'completed',
        repositoryUrl: validation.normalizedUrl,
        receivedAt: new Date().toISOString(),
        message: `Repository analysis completed for ${owner}/${repo}. Detected: ${detection.projectType} (${detection.framework}).`,
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
