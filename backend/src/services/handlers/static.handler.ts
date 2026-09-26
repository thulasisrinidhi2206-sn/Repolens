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

    // 1. Filter safe static file paths (blocking ../, .git, .env, etc.)
    const safePaths = StaticDetectorService.filterSafeStaticFiles(allFilePaths);

    // 2. Download files concurrently in controlled batches
    const batchSize = 6;
    for (let i = 0; i < safePaths.length; i += batchSize) {
      const batch = safePaths.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (relPath) => {
          const fileBuf = await gitHubService.getFileBuffer(repo.owner, repo.repo, relPath, metadata.defaultBranch);
          if (fileBuf) {
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

    // 3. Ensure entry index.html is present in the root of the workspace
    const rootIndex = path.join(workspacePath, 'index.html');
    try {
      await fs.access(rootIndex);
    } catch {
      // Look for candidate index.html in subfolders (e.g. public/index.html or dist/index.html)
      const candidates = ['public/index.html', 'src/index.html', 'dist/index.html'];
      for (const candidate of candidates) {
        const candidatePath = path.join(workspacePath, candidate);
        try {
          await fs.access(candidatePath);
          await fs.copyFile(candidatePath, rootIndex);
          break;
        } catch {
          // Continue searching
        }
      }
    }

    // Final verification
    try {
      await fs.access(rootIndex);
    } catch {
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

