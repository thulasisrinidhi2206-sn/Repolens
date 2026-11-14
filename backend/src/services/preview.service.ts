/**
 * RepoLens - Preview Orchestrator Service
 * Coordinates validation, static eligibility checks, isolated workspace provisioning, and sandboxed container execution
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { CreatePreviewData, ProjectPreview, RepoIdentifier } from '@repolens/shared';
import { GitHubUrlValidatorService, ValidationResult } from './validator.service';
import { gitHubService, GitHubApiError } from './github.service';
import { ProjectDetectorService } from './detector.service';
import { StaticDetectorService } from './static-detector.service';
import { dockerRuntimeService } from './docker-runtime.service';
import { previewManagerService } from './preview-manager.service';
import { previewCleanupService } from './preview-cleanup.service';
import { staticPreviewHandler } from './handlers/static.handler';
import { vitePreviewHandler } from './handlers/vite.handler';
import { IPreviewHandler } from './handlers/preview-handler.interface';

export interface PreviewServiceResult {
  success: boolean;
  statusCode: number;
  data?: CreatePreviewData;
  error?: string;
  errorType?: string;
}

export class PreviewService {
  private handlers: IPreviewHandler[] = [
    staticPreviewHandler,
    vitePreviewHandler,
  ];

  /**
   * Generates an isolated, sandboxed preview for an eligible GitHub repository (Static or Vite)
   */
  public async createPreview(rawUrl: string, publicApiBaseUrl?: string): Promise<PreviewServiceResult> {
    // 1. Validate GitHub Repository URL
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
    const previewId = crypto.randomUUID();
    const repoIdentifier: RepoIdentifier = { owner, repo };

    // 2. Fetch Repository Metadata
    let metadata;
    let targetBranch: string;
    try {
      metadata = await gitHubService.getRepositoryMetadata(owner, repo);
      targetBranch = validation.repo.branch || metadata.defaultBranch;
      repoIdentifier.branch = targetBranch;
    } catch (err: unknown) {
      if (err instanceof GitHubApiError) {
        return {
          success: false,
          statusCode: err.statusCode,
          error: err.message,
          errorType: err.errorType,
        };
      }
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to retrieve repository metadata from GitHub.',
        errorType: 'GITHUB_ERROR',
      };
    }

    // 3. Fetch Root & Recursive Git Tree from GitHub API
    let treeItems: { path: string; mode: string; type: 'blob' | 'tree'; sha: string; size?: number }[] = [];
    try {
      treeItems = await gitHubService.getGitTree(owner, repo, targetBranch, true);
    } catch (err: unknown) {
      console.warn(`[PreviewService] Recursive tree fetch failed, falling back to root contents:`, err);
    }

    const rootItems = await gitHubService.getRootContents(owner, repo, targetBranch);
    const rootFileNames = rootItems.map(i => i.name);
    const allFilePaths = treeItems.length > 0 ? treeItems.map(i => i.path) : rootFileNames;

    // Fetch package.json if present at repository root
    let packageJsonRaw: string | null = null;
    const rootFileSet = new Set(rootFileNames.map(f => f.toLowerCase()));
    if (rootFileSet.has('package.json')) {
      try {
        packageJsonRaw = await gitHubService.getFileRawContent(owner, repo, 'package.json', targetBranch);
      } catch (err: unknown) {
        console.warn(`[PreviewService] Could not fetch package.json for ${owner}/${repo}:`, err);
      }
    }

    // 4. Inspect Project Type & Framework (Detecting Vite before Node.js fallback)
    const projectDetection = ProjectDetectorService.detect({
      rootFiles: rootFileNames,
      allFiles: allFilePaths,
      packageJsonRaw,
      metadata,
    });

    // 5. Evaluate Preview Eligibility (Static or Vite)
    const eligibility = StaticDetectorService.evaluateEligibility({
      projectType: projectDetection.projectType,
      framework: projectDetection.framework,
      rootFiles: rootFileNames,
      allFiles: allFilePaths,
      packageJsonRaw,
    });

    if (!eligibility.isEligible) {
      return {
        success: false,
        statusCode: 400,
        error: eligibility.reason || 'This repository is not eligible for visual preview.',
        errorType: 'UNSUPPORTED_PROJECT_TYPE',
      };
    }

    const activeProjectType = eligibility.projectType || projectDetection.projectType;

    // 6. Select Appropriate Modular Preview Handler
    const handler = this.handlers.find(h =>
      h.canHandle(activeProjectType, projectDetection.framework)
    );

    if (!handler) {
      return {
        success: false,
        statusCode: 400,
        error: `No preview handler available for project type '${activeProjectType}'.`,
        errorType: 'UNSUPPORTED_PROJECT_TYPE',
      };
    }

    // Static HTML/CSS/JS previews are served directly by the backend and do not need Docker.
    // Vite projects still require an isolated container for dependency installation and builds.
    const isDirectStaticPreview = activeProjectType === 'HTML/CSS/JavaScript';
    if (!isDirectStaticPreview) {
      const dockerStatus = await dockerRuntimeService.checkAvailability();
      if (!dockerStatus.available) {
        const errorMsg = dockerStatus.details
          ? `Docker container runtime is currently unavailable on the host system: ${dockerStatus.details}`
          : (dockerStatus.error || 'Docker container runtime is currently unavailable on the host system.');

        return {
          success: false,
          statusCode: 503,
          error: errorMsg,
          errorType: 'DOCKER_UNAVAILABLE',
        };
      }
    }

    // Initialize in-memory session tracking.
    const session = previewManagerService.createSession({
      previewId,
      repo: repoIdentifier,
      projectType: activeProjectType,
      framework: projectDetection.framework,
      ttlMinutes: 10,
    });

    // Create a bounded temporary workspace for this preview.
    const workspacePath = path.join(os.tmpdir(), 'repolens-previews', previewId);
    try {
      await fs.mkdir(workspacePath, { recursive: true });
      previewManagerService.appendLog(previewId, `Created temporary workspace at ${workspacePath}`);
      previewManagerService.updateSession(previewId, { status: 'building' });

      // Static projects do not need a host port; container-backed projects do.
      const hostPort = isDirectStaticPreview ? 0 : await dockerRuntimeService.findAvailablePort();
      const previewContext = {
        previewId,
        repo: repoIdentifier,
        metadata,
        workspacePath,
        allFilePaths,
        port: hostPort,
      };

      previewManagerService.appendLog(previewId, 'Downloading repository source files from GitHub...');
      await handler.prepareWorkspace(previewContext);
      previewManagerService.appendLog(previewId, 'Workspace files successfully downloaded and verified.');

      if (handler.build) {
        previewManagerService.appendLog(previewId, 'Starting containerized dependency install and build (node:20-alpine)...');
        const buildResult = await handler.build(previewContext);
        if (!buildResult.success) throw new Error(buildResult.error || 'Compilation failed inside build container.');
        previewManagerService.appendLog(previewId, 'Containerized build completed successfully.');
      }

      const previewUrl = `${(publicApiBaseUrl || process.env.PREVIEW_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '')}/api/preview/${encodeURIComponent(previewId)}/content/`;
      let containerId: string | undefined;
      let servingPort: number | undefined;

      if (isDirectStaticPreview) {
        // No repository code is executed on the backend; files are served as sandboxed iframe content.
        previewManagerService.setWorkspacePath(previewId, workspacePath);
        previewManagerService.appendLog(previewId, 'Static files are ready and will be served without Docker.');
      } else {
        const containerOptions = handler.getContainerOptions(previewContext);
        previewManagerService.appendLog(previewId, `Creating isolated Docker serving container on localhost:${hostPort}...`);
        const containerResult = await dockerRuntimeService.startStaticContainer(containerOptions);
        containerId = containerResult.containerId;
        servingPort = containerResult.port;
        previewManagerService.appendLog(previewId, `Container ${containerResult.containerId} created.`);
      }

      // 12. Update Session State to Ready & Log Preview Start
      previewManagerService.updateSession(previewId, {
        status: 'ready',
        previewUrl,
        containerId,
        port: servingPort,
      });

      console.log(`[PreviewLifecycle:PreviewStart] Preview started successfully for ${owner}/${repo}`);
      previewManagerService.appendLog(previewId, 'Preview server is available through the public backend URL.');

      // 13. Schedule Automatic TTL Expiry Cleanup (10 minutes)
      previewCleanupService.registerPreview(previewId, workspacePath, 10 * 60 * 1000, (id) => {
        previewManagerService.updateSession(id, { status: 'stopped' });
        previewManagerService.appendLog(id, 'Preview session expired and resources cleaned up.');
        console.log(`[PreviewLifecycle:Cleanup] Preview session ${id} expired and cleaned up.`);
      });

      const updatedSession = previewManagerService.getSession(previewId) || session;

      const responseData: CreatePreviewData = {
        ...updatedSession,
        repositoryUrl: validation.normalizedUrl,
        message: isDirectStaticPreview
          ? `Static preview started successfully. Files are served without a Docker dependency at ${previewUrl}`
          : `Preview started successfully (${activeProjectType}). Container isolated and available at ${previewUrl}`,
      };

      return {
        success: true,
        statusCode: 201,
        data: responseData,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown preview failure';
      console.error(`[PreviewLifecycle:PreviewFailure] Preview failure for session ${previewId}: ${errMsg}`);

      previewManagerService.updateSession(previewId, {
        status: 'failed',
        error: errMsg,
      });
      previewManagerService.appendLog(previewId, `Preview failed: ${errMsg}`);

      // Cleanup any allocated resources immediately on failure
      console.log(`[PreviewLifecycle:Cleanup] Triggering failure cleanup for preview ${previewId}`);
      await previewCleanupService.cleanup(previewId, workspacePath, !isDirectStaticPreview);

      return {
        success: false,
        statusCode: 500,
        error: `Failed to create preview: ${errMsg}`,
        errorType: 'CONTAINER_START_FAILURE',
      };
    }
  }

  /**
   * Retrieves current status and logs for an existing preview session
   */
  public async getPreview(previewId: string): Promise<PreviewServiceResult> {
    const session = previewManagerService.getSession(previewId);

    if (!session) {
      return {
        success: false,
        statusCode: 404,
        error: `Preview session '${previewId}' not found or has expired.`,
        errorType: 'PREVIEW_NOT_FOUND',
      };
    }

    // Optionally append latest container logs if still running
    if ((session.status === 'ready' || session.status === 'running') && session.containerId) {
      const containerLogs = await dockerRuntimeService.getContainerLogs(previewId, 10);
      if (containerLogs.length > 0) {
        // Return session with fresh logs
      }
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        ...session,
        repositoryUrl: `https://github.com/${session.repo.owner}/${session.repo.repo}`,
        message: `Preview is currently ${session.status}.`,
      },
    };
  }

  /**
   * Stops an active preview session and cleans up resources immediately
   */
  public async stopPreview(previewId: string): Promise<PreviewServiceResult> {
    const session = previewManagerService.getSession(previewId);

    if (!session) {
      return {
        success: false,
        statusCode: 404,
        error: `Preview session '${previewId}' not found.`,
        errorType: 'PREVIEW_NOT_FOUND',
      };
    }

    await previewCleanupService.cleanup(previewId);

    previewManagerService.updateSession(previewId, {
      status: 'stopped',
    });
    previewManagerService.appendLog(previewId, 'Preview session stopped by user request.');

    const updatedSession = previewManagerService.getSession(previewId) || session;

    return {
      success: true,
      statusCode: 200,
      data: {
        ...updatedSession,
        repositoryUrl: `https://github.com/${session.repo.owner}/${session.repo.repo}`,
        message: 'Preview session stopped and isolated resources deleted.',
      },
    };
  }
}

export const previewService = new PreviewService();

