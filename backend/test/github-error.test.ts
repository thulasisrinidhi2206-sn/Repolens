import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubService, GitHubApiError } from '../src/services/github.service';

describe('GitHubService Error Handling', () => {
  it('should distinguish 404 missing files and return null in getFileRawContent', async () => {
    // Mock service pointing to a mock baseUrl that returns 404
    const service = new GitHubService('https://mock.local');
    // Replace internal request method to simulate 404
    (service as any).request = async () => {
      throw new GitHubApiError('Not found', 'NOT_FOUND', 404);
    };

    const content = await service.getFileRawContent('owner', 'repo', 'missing.json');
    assert.equal(content, null);
  });

  it('should propagate rate limit errors rather than masking them as null', async () => {
    const service = new GitHubService('https://mock.local');
    (service as any).request = async () => {
      throw new GitHubApiError('GitHub API rate limit exceeded', 'RATE_LIMIT', 429);
    };

    await assert.rejects(
      async () => {
        await service.getFileRawContent('owner', 'repo', 'package.json');
      },
      (err: any) => {
        return err instanceof GitHubApiError && err.statusCode === 429 && err.errorType === 'RATE_LIMIT';
      }
    );
  });

  it('should propagate network failures as API_FAILURE', async () => {
    const service = new GitHubService('https://mock.local');
    (service as any).request = async () => {
      throw new GitHubApiError('Failed to reach GitHub API', 'API_FAILURE', 503);
    };

    await assert.rejects(
      async () => {
        await service.fetchReadmeContent('owner', 'repo');
      },
      (err: any) => {
        return err instanceof GitHubApiError && err.statusCode === 503;
      }
    );
  });

  it('should enforce individual file size limit in getFileBuffer', async () => {
    const service = new GitHubService('https://mock.local');
    (service as any).request = async () => {
      // Return file exceeding maxBytes
      return {
        name: 'huge.bin',
        size: 10 * 1024 * 1024, // 10MB
        content: Buffer.alloc(100).toString('base64'),
        encoding: 'base64',
      };
    };

    await assert.rejects(
      async () => {
        await service.getFileBuffer('owner', 'repo', 'huge.bin', 'main', 5 * 1024 * 1024);
      },
      /exceeds maximum size limit/
    );
  });
});
