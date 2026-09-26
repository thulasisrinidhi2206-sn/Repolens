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

export interface PreviewServiceResult {
  success: boolean;
  statusCode: number;
  data?: CreatePreviewData;
  error?: string;
  errorType?: string;
}

export class PreviewService {
  /**
   * Generates an isolated, sandboxed preview for an eligible static GitHub repository
   */
  public async createPreview(rawUrl: string): Promise<PreviewServiceResult> {
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
    try {
      metadata = await gitHubService.getRepositoryMetadata(owner, repo);
      repoIdentifier.branch = metadata.defaultBranch;
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
      treeItems = await gitHubService.getGitTree(owner, repo, metadata.defaultBranch, true);
    } catch (err: unknown) {
      console.warn(`[PreviewService] Recursive tree fetch failed, falling back to root contents:`, err);
    }

    const rootItems = await gitHubService.getRootContents(owner, repo, metadata.defaultBranch);
    const rootFileNames = rootItems.map(i => i.name);
    const allFilePaths = treeItems.length > 0 ? treeItems.map(i => i.path) : rootFileNames;

    // 4. Inspect Project Type & Framework
    const projectDetection = ProjectDetectorService.detect({
      rootFiles: rootFileNames,
      metadata,
    });

    // 5. Evaluate Static Preview Eligibility
    const eligibility = StaticDetectorService.evaluateEligibility({
      projectType: projectDetection.projectType,
      framework: projectDetection.framework,
      rootFiles: rootFileNames,
      allFiles: allFilePaths,
    });

    if (!eligibility.isEligible) {
      return {
        success: false,
        statusCode: 400,
        error: eligibility.reason || 'This repository is not eligible for static HTML preview.',
        errorType: 'UNSUPPORTED_PROJECT_TYPE',
      };
    }

    // 6. Check Container Runtime Availability (Docker)
    const isDockerReady = await dockerRuntimeService.isAvailable();
    if (!isDockerReady) {
      return {
        success: false,
        statusCode: 503,
        error: 'Docker container runtime is currently unavailable on the host system. Please ensure the Docker daemon is running.',
        errorType: 'DOCKER_UNAVAILABLE',
      };
    }

    // Initialize in-memory session tracking
    const session = previewManagerService.createSession({
      previewId,
      repo: repoIdentifier,
      projectType: 'HTML/CSS/JavaScript',
      framework: projectDetection.framework,
      ttlMinutes: 10,
    });

    // 7. Create Isolated Temporary Workspace Directory on Host
    const workspacePath = path.join(os.tmpdir(), 'repolens-previews', previewId);
    try {
      await fs.mkdir(workspacePath, { recursive: true });
      previewManagerService.appendLog(previewId, `Created temporary workspace at ${workspacePath}`);
      previewManagerService.updateSession(previewId, { status: 'building' });

      // 8. Allocate Ephemeral Port & Prepare Workspace via StaticPreviewHandler
      const hostPort = await dockerRuntimeService.findAvailablePort();

      const previewContext = {
        previewId,
        repo: repoIdentifier,
        metadata,
        workspacePath,
        allFilePaths,
        port: hostPort,
      };

      previewManagerService.appendLog(previewId, `Fetching and verifying static repository files from GitHub...`);
      await staticPreviewHandler.prepareWorkspace(previewContext);
      previewManagerService.appendLog(previewId, 'Workspace files successfully downloaded and verified.');

      // 9. Start Sandboxed Container
      const containerOptions = staticPreviewHandler.getContainerOptions(previewContext);

      console.log(`[PreviewLifecycle:ContainerCreation] Creating isolated container repolens-preview-${previewId} on localhost:${hostPort}`);
      previewManagerService.appendLog(previewId, `Creating isolated Docker container (nginx:alpine) on localhost:${hostPort}...`);

      const containerResult = await dockerRuntimeService.startStaticContainer(containerOptions);

      console.log(`[PreviewLifecycle:ContainerCreated] Container ${containerResult.containerId} created for session ${previewId}`);
      previewManagerService.appendLog(previewId, `Container ${containerResult.containerId} created.`);

      // 10. Update Session State to Ready & Log Preview Start
      previewManagerService.updateSession(previewId, {
        status: 'ready',
        previewUrl: containerResult.previewUrl,
        containerId: containerResult.containerId,
        port: containerResult.port,
      });

      console.log(`[PreviewLifecycle:PreviewStart] Preview started successfully at ${containerResult.previewUrl} for ${owner}/${repo}`);
      previewManagerService.appendLog(previewId, `Preview server running at ${containerResult.previewUrl}`);

      // 11. Schedule Automatic TTL Expiry Cleanup (10 minutes)
      previewCleanupService.registerPreview(previewId, workspacePath, 10 * 60 * 1000, (id) => {
        previewManagerService.updateSession(id, { status: 'stopped' });
        previewManagerService.appendLog(id, 'Preview session expired and resources cleaned up.');
        console.log(`[PreviewLifecycle:Cleanup] Preview session ${id} expired and cleaned up.`);
      });

      const updatedSession = previewManagerService.getSession(previewId) || session;

      const responseData: CreatePreviewData = {
        ...updatedSession,
        repositoryUrl: validation.normalizedUrl,
        message: `Static preview started successfully. Container isolated and accessible on ${containerResult.previewUrl}`,
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
      await previewCleanupService.cleanup(previewId, workspacePath);

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
    if (session.status === 'ready' || session.status === 'running') {
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

