import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../src/app';
import { previewManagerService } from '../src/services/preview-manager.service';

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

  it('proxies preview HTML and rewrites root-relative assets through the public route', async () => {
    const previewId = 'proxy-test-session';
    const previewServer = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><head></head><body><script src="/assets/app.js"></script><link href="/assets/app.css"></body></html>');
        return;
      }

      if (req.url === '/assets/app.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        res.end('.logo { background-image: url("/images/logo.svg"); }');
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise<void>(resolve => previewServer.listen(0, '127.0.0.1', resolve));
    const address = previewServer.address() as { port: number };
    previewManagerService.createSession({
      previewId,
      repo: { owner: 'test', repo: 'preview' },
      projectType: 'HTML/CSS/JavaScript',
    });
    previewManagerService.updateSession(previewId, { status: 'ready', port: address.port });

    try {
      const htmlResponse = await fetch(`${baseUrl}/api/preview/${previewId}/content/`);
      assert.equal(htmlResponse.status, 200);
      const html = await htmlResponse.text();
      assert.match(html, /<base href="\/api\/preview\/proxy-test-session\/content\/">/);
      assert.match(html, /src="\/api\/preview\/proxy-test-session\/content\/assets\/app\.js"/);

      const cssResponse = await fetch(`${baseUrl}/api/preview/${previewId}/content/assets/app.css`);
      assert.equal(cssResponse.status, 200);
      assert.match(await cssResponse.text(), /url\("\/api\/preview\/proxy-test-session\/content\/images\/logo\.svg"\)/);
    } finally {
      previewManagerService.removeSession(previewId);
      await new Promise<void>(resolve => previewServer.close(() => resolve()));
    }
  });

  it('GET /unknown-path should return 404 JSON response', async () => {
    const res = await fetch(`${baseUrl}/random-unknown-endpoint`);
    assert.equal(res.status, 404);
    const body: any = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error || '', /Route not found/i);
  });
});
