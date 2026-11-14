/**
 * RepoLens - Static HTML/CSS/JavaScript Preview Handler
 * Downloads static assets and prepares an isolated Nginx container configuration without executing any host code
 */

import fs from 'fs/promises';
import path from 'path';
import { ProjectType } from '@repolens/shared';
import { IPreviewHandler, PreviewContext } from './preview-handler.interface';
import { StaticDetectorService } from '../static-detector.service';
import { gitHubService } from '../github.service';
import { ContainerStartOptions } from '../docker-runtime.service';

export class StaticPreviewHandler implements IPreviewHandler {
  public readonly supportedProjectType: ProjectType = 'HTML/CSS/JavaScript';

  public canHandle(projectType: ProjectType): boolean {
    return projectType === 'HTML/CSS/JavaScript';
  }

  /**
   * Safely downloads static assets into the isolated workspace directory without running npm or host scripts
   */
  public async prepareWorkspace(context: PreviewContext): Promise<void> {
    const { repo, metadata, workspacePath, allFilePaths } = context;
    const targetBranch = repo.branch || metadata.defaultBranch;

    // 1. Filter safe static file paths (blocking ../, .git, .env, etc.)
    const safePaths = StaticDetectorService.filterSafeStaticFiles(allFilePaths);

    // Limit maximum files processed to avoid resource exhaustion
    const MAX_FILES = 400;
    const pathsToDownload = safePaths.slice(0, MAX_FILES);

    const MAX_WORKSPACE_BYTES = 50 * 1024 * 1024; // 50MB
    const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
    let totalDownloadedBytes = 0;

    // 2. Download files concurrently in controlled batches
    const batchSize = 6;
    for (let i = 0; i < pathsToDownload.length; i += batchSize) {
      const batch = pathsToDownload.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (relPath) => {
          if (totalDownloadedBytes > MAX_WORKSPACE_BYTES) {
            throw new Error(`Repository workspace exceeded total download limit of 50MB.`);
          }

          const fileBuf = await gitHubService.getFileBuffer(repo.owner, repo.repo, relPath, targetBranch, MAX_FILE_BYTES);
          if (fileBuf) {
            totalDownloadedBytes += fileBuf.length;
            if (totalDownloadedBytes > MAX_WORKSPACE_BYTES) {
              throw new Error(`Repository workspace exceeded total download limit of 50MB.`);
            }

            const targetFilePath = path.join(workspacePath, relPath);
            const normalizedTarget = path.resolve(targetFilePath);

            // Guard against path traversal escaping the workspace
            if (!normalizedTarget.startsWith(path.resolve(workspacePath))) {
              console.warn(`[StaticPreviewHandler] Directory traversal attempted: ${relPath}`);
              return;
            }

            await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
            await fs.writeFile(targetFilePath, fileBuf);
          }
        })
      );
    }

    // 3. Verify an entry point exists. Keep its original directory intact so relative
    // asset paths (for example dist/assets/*) continue to resolve correctly.
    const candidates = ['index.html', 'public/index.html', 'src/index.html', 'dist/index.html'];
    let entryFound = false;
    for (const candidate of candidates) {
      try {
        await fs.access(path.join(workspacePath, candidate));
        entryFound = true;
        break;
      } catch {
        // Try the next supported entry location.
      }
    }
    if (!entryFound) {
      throw new Error('Static preview workspace preparation failed: index.html is missing.');
    }
  }

  /**
   * Returns Docker container configuration for serving static assets via Nginx
   */
  public getContainerOptions(context: PreviewContext): ContainerStartOptions {
    return {
      previewId: context.previewId,
      workspacePath: context.workspacePath,
      port: context.port,
    };
  }
}

export const staticPreviewHandler = new StaticPreviewHandler();

