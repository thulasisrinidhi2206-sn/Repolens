/**
 * RepoLens - Preview Cleanup & Lifecycle Management Service
 * Enforces automatic cleanup of temporary workspaces, expired sessions, and isolated containers
 */

import fs from 'fs/promises';
import { dockerRuntimeService } from './docker-runtime.service';

export interface ActiveCleanupEntry {
  previewId: string;
  workspacePath?: string;
  containerId?: string;
  expiresAt: number; // Unix timestamp ms
  timer?: NodeJS.Timeout;
}

export class PreviewCleanupService {
  private activeCleanups = new Map<string, ActiveCleanupEntry>();
  private sweepInterval?: NodeJS.Timeout;
  private isShutdownRegistered = false;

  constructor() {
    this.registerShutdownHooks();
    this.startPeriodicSweep();
  }

  /**
   * Registers a preview for automated TTL cleanup
   */
  public registerPreview(
    previewId: string,
    workspacePath: string,
    ttlMs: number = 10 * 60 * 1000, // 10 minutes default
    onExpire?: (previewId: string) => void
  ): void {
    // Clear existing entry if present
    this.clearCleanup(previewId);

    const expiresAt = Date.now() + ttlMs;

    const timer = setTimeout(async () => {
      console.log(`[PreviewCleanup] TTL expired for preview session: ${previewId}. Triggering cleanup.`);
      if (onExpire) {
        onExpire(previewId);
      }
      await this.cleanup(previewId);
    }, ttlMs);

    // Unref timer so it does not block Node process termination in testing
    timer.unref();

    this.activeCleanups.set(previewId, {
      previewId,
      workspacePath,
      expiresAt,
      timer,
    });
  }

  /**
   * Executes immediate teardown and cleanup of a preview session (container + temporary files)
   */
  public async cleanup(previewId: string, customWorkspacePath?: string): Promise<boolean> {
    const entry = this.activeCleanups.get(previewId);
    const workspacePath = entry?.workspacePath || customWorkspacePath;

    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
    this.activeCleanups.delete(previewId);

    let success = true;

    // 1. Stop and remove Docker container
    try {
      await dockerRuntimeService.stopContainer(previewId);
    } catch (err) {
      console.error(`[PreviewCleanup] Failed to stop container for ${previewId}:`, err);
      success = false;
    }

    // 2. Remove isolated workspace directory
    if (workspacePath) {
      try {
        await fs.rm(workspacePath, { recursive: true, force: true });
        console.log(`[PreviewCleanup] Removed temporary workspace: ${workspacePath}`);
      } catch (err) {
        console.error(`[PreviewCleanup] Failed to remove workspace ${workspacePath}:`, err);
        success = false;
      }
    }

    return success;
  }

  /**
   * Cancels scheduled timer without immediately destroying workspace
   */
  public clearCleanup(previewId: string): void {
    const existing = this.activeCleanups.get(previewId);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }
    this.activeCleanups.delete(previewId);
  }

  /**
   * Periodic sweep to identify and clean up any expired or orphaned preview entries
   */
  private startPeriodicSweep(): void {
    this.sweepInterval = setInterval(async () => {
      const now = Date.now();
      for (const [previewId, entry] of this.activeCleanups.entries()) {
        if (entry.expiresAt <= now) {
          console.log(`[PreviewCleanup] Sweep identified expired preview: ${previewId}`);
          await this.cleanup(previewId);
        }
      }
    }, 60000);

    this.sweepInterval.unref();
  }

  /**
   * Registers graceful termination hooks on process exit
   */
  public registerShutdownHooks(): void {
    if (this.isShutdownRegistered) return;
    this.isShutdownRegistered = true;

    const shutdownHandler = async (signal: string) => {
      console.log(`[PreviewCleanup] Process received ${signal}. Cleaning up all active preview containers.`);
      if (this.sweepInterval) {
        clearInterval(this.sweepInterval);
      }

      const cleanups = Array.from(this.activeCleanups.keys()).map(id => this.cleanup(id));
      await Promise.allSettled(cleanups);
    };

    process.once('SIGINT', () => shutdownHandler('SIGINT'));
    process.once('SIGTERM', () => shutdownHandler('SIGTERM'));
  }
}

export const previewCleanupService = new PreviewCleanupService();

