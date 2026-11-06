import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../src/app';

describe('RepoLens Backend API Endpoints', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /health should return 200 with operational status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data?.status, 'healthy');
    assert.equal(body.data?.service, 'repolens-backend');
  });

  it('GET /api/health should return 200 with operational status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data?.status, 'healthy');
  });

  it('POST /api/analyze with empty body should return 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error || '', /repositoryUrl/i);
  });

  it('POST /api/preview with invalid URL should return 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl: 'not-a-valid-github-url' }),
    });
    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.equal(body.success, false);
  });

  it('GET /api/preview/non-existent-id should return 404 Not Found', async () => {
    const res = await fetch(`${baseUrl}/api/preview/non-existent-session-id`);
    assert.equal(res.status, 404);
    const body: any = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error || '', /not found/i);
  });

  it('GET /unknown-path should return 404 JSON response', async () => {
    const res = await fetch(`${baseUrl}/random-unknown-endpoint`);
    assert.equal(res.status, 404);
    const body: any = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error || '', /Route not found/i);
  });
});
