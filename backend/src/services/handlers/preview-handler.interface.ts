/**
 * RepoLens - Modular Preview Handler Interface
 * Allows pluggable preview engines for different project architectures (Static, Vite, React, etc.)
 */

import { ProjectType, RepoIdentifier, RepositoryMetadata } from '@repolens/shared';
import { ContainerStartOptions } from '../docker-runtime.service';

export interface PreviewContext {
  previewId: string;
  repo: RepoIdentifier;
  metadata: RepositoryMetadata;
  workspacePath: string;
  allFilePaths: string[];
  port: number;
}

export interface BuildResult {
  success: boolean;
  logs: string[];
  error?: string;
  distPath?: string;
}

export interface IPreviewHandler {
  readonly supportedProjectType: ProjectType;

  /**
   * Returns true if this handler can process the given project type and framework
   */
  canHandle(projectType: ProjectType, framework?: string): boolean;

  /**
   * Prepares the workspace filesystem (downloads required files safely)
   */
  prepareWorkspace(context: PreviewContext): Promise<void>;

  /**
   * Builds the application inside an isolated container if required
   */
  build?(context: PreviewContext): Promise<BuildResult>;

  /**
   * Returns the Docker container start options for isolated serving execution
   */
  getContainerOptions(context: PreviewContext): ContainerStartOptions;
}


