/**
 * RepoLens - Preview Session Manager Service
 * Tracks active preview sessions, lifecycle states, logs, and status transitions
 */

import { ProjectPreview, PreviewStatus, RepoIdentifier, ProjectType } from '@repolens/shared';

export interface CreateSessionOptions {
  previewId: string;
  repo: RepoIdentifier;
  projectType: ProjectType;
  framework?: string;
  ttlMinutes?: number;
}

export class PreviewManagerService {
  private sessions = new Map<string, ProjectPreview>();

  /**
   * Initializes a new preview session
   */
  public createSession(options: CreateSessionOptions): ProjectPreview {
    const { previewId, repo, projectType, framework, ttlMinutes = 10 } = options;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();

    const session: ProjectPreview = {
      id: previewId,
      repo,
      status: 'queued',
      projectType,
      framework,
      expiresAt,
      logs: [`[${now.toISOString()}] Preview session queued for ${repo.owner}/${repo.repo}`],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.sessions.set(previewId, session);
    return session;
  }

  /**
   * Retrieves an active preview session by ID
   */
  public getSession(previewId: string): ProjectPreview | undefined {
    return this.sessions.get(previewId);
  }

  /**
   * Updates preview session state and timestamp
   */
  public updateSession(previewId: string, updates: Partial<ProjectPreview>): ProjectPreview | undefined {
    const session = this.sessions.get(previewId);
    if (!session) return undefined;

    Object.assign(session, updates, {
      updatedAt: new Date().toISOString(),
    });

    return session;
  }

  /**
   * Appends an event log entry to the preview session without logging sensitive secrets
   */
  public appendLog(previewId: string, message: string): void {
    const session = this.sessions.get(previewId);
    if (!session) return;

    if (!session.logs) {
      session.logs = [];
    }

    const timestamp = new Date().toISOString();
    // Sanitize any accidental bearer tokens or secrets
    const sanitized = message.replace(/(Bearer\s+)[A-Za-z0-9_\-\.]+/gi, '$1[REDACTED]');
    session.logs.push(`[${timestamp}] ${sanitized}`);
    session.updatedAt = timestamp;
  }

  /**
   * Lists all tracked preview sessions
   */
  public listSessions(): ProjectPreview[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Removes a session from the in-memory registry
   */
  public removeSession(previewId: string): boolean {
    return this.sessions.delete(previewId);
  }
}

export const previewManagerService = new PreviewManagerService();

