import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewManagerService } from '../src/services/preview-manager.service';
import { PreviewCleanupService } from '../src/services/preview-cleanup.service';

describe('PreviewManagerService & Expiration', () => {
  it('should initialize a session with queued status and valid expiration timestamp', () => {
    const manager = new PreviewManagerService();
    const session = manager.createSession({
      previewId: 'test-preview-1',
      repo: { owner: 'testowner', repo: 'testrepo' },
      projectType: 'HTML/CSS/JavaScript',
      ttlMinutes: 10,
    });

    assert.equal(session.id, 'test-preview-1');
    assert.equal(session.status, 'queued');
    assert.equal(typeof session.expiresAt, 'string');
    assert.equal(new Date(session.expiresAt!).getTime() > Date.now(), true);
  });

  it('should mark expired sessions as stopped when retrieved', () => {
    const manager = new PreviewManagerService();
    manager.createSession({
      previewId: 'expired-preview',
      repo: { owner: 'testowner', repo: 'testrepo' },
      projectType: 'HTML/CSS/JavaScript',
      ttlMinutes: -1, // Expired in the past
    });

    const retrieved = manager.getSession('expired-preview');
    assert.ok(retrieved);
    assert.equal(retrieved.status, 'stopped');
  });

  it('should append sanitized logs to active session', () => {
    const manager = new PreviewManagerService();
    manager.createSession({
      previewId: 'log-preview',
      repo: { owner: 'testowner', repo: 'testrepo' },
      projectType: 'HTML/CSS/JavaScript',
    });

    manager.appendLog('log-preview', 'Starting download with Bearer secret-token-12345');
    const session = manager.getSession('log-preview');
    assert.ok(session?.logs);
    assert.equal(session.logs.some(l => l.includes('secret-token-12345')), false);
    assert.equal(session.logs.some(l => l.includes('[REDACTED]')), true);
  });
});
