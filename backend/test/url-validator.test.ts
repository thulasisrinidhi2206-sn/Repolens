import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubUrlValidatorService } from '../src/services/validator.service';

describe('GitHubUrlValidatorService', () => {
  it('should validate and parse a standard public repository URL', () => {
    const result = GitHubUrlValidatorService.validateAndParse('https://github.com/facebook/react');
    assert.equal(result.isValid, true);
    assert.equal(result.repo?.owner, 'facebook');
    assert.equal(result.repo?.repo, 'react');
    assert.equal(result.repo?.branch, undefined);
    assert.equal(result.normalizedUrl, 'https://github.com/facebook/react');
  });

  it('should handle URL with trailing slashes and .git extension', () => {
    const result = GitHubUrlValidatorService.validateAndParse('https://github.com/vercel/next.js.git/');
    assert.equal(result.isValid, true);
    assert.equal(result.repo?.owner, 'vercel');
    assert.equal(result.repo?.repo, 'next.js');
  });

  it('should auto-prepend https protocol if omitted', () => {
    const result = GitHubUrlValidatorService.validateAndParse('github.com/torvalds/linux');
    assert.equal(result.isValid, true);
    assert.equal(result.repo?.owner, 'torvalds');
    assert.equal(result.repo?.repo, 'linux');
  });

  it('should extract a single-segment branch name from /tree/:branch', () => {
    const result = GitHubUrlValidatorService.validateAndParse('https://github.com/owner/repo/tree/develop');
    assert.equal(result.isValid, true);
    assert.equal(result.repo?.owner, 'owner');
    assert.equal(result.repo?.repo, 'repo');
    assert.equal(result.repo?.branch, 'develop');
  });

  it('should extract a multi-segment branch name containing slashes (e.g. feature/auth-v2)', () => {
    const result = GitHubUrlValidatorService.validateAndParse('https://github.com/owner/repo/tree/feature/auth-v2');
    assert.equal(result.isValid, true);
    assert.equal(result.repo?.branch, 'feature/auth-v2');
  });

  it('should decode URL-encoded branch names', () => {
    const result = GitHubUrlValidatorService.validateAndParse('https://github.com/owner/repo/tree/feature%2Fnew-dashboard');
    assert.equal(result.isValid, true);
    assert.equal(result.repo?.branch, 'feature/new-dashboard');
  });

  it('should reject invalid or non-github hosts', () => {
    const result = GitHubUrlValidatorService.validateAndParse('https://gitlab.com/owner/repo');
    assert.equal(result.isValid, false);
    assert.match(result.error || '', /URL host must be github\.com/);
  });

  it('should reject GitHub reserved system routes as owners', () => {
    const result = GitHubUrlValidatorService.validateAndParse('https://github.com/settings/profile');
    assert.equal(result.isValid, false);
    assert.match(result.error || '', /reserved GitHub system path/);
  });

  it('should reject empty or malformed inputs', () => {
    assert.equal(GitHubUrlValidatorService.validateAndParse('').isValid, false);
    assert.equal(GitHubUrlValidatorService.validateAndParse('not-a-url').isValid, false);
    assert.equal(GitHubUrlValidatorService.validateAndParse('https://github.com/onlyowner').isValid, false);
  });
});
