import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../src/app';

describe('Ask Your Repository API', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('rejects a missing repository URL', async () => {
    const response = await fetch(baseUrl + '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Where is authentication?' })
    });
    assert.equal(response.status, 400);
    const body: any = await response.json();
    assert.equal(body.success, false);
    assert.match(body.error, /repositoryUrl/i);
  });

  it('rejects a missing or too-short question', async () => {
    const response = await fetch(baseUrl + '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl: 'https://github.com/facebook/react', question: 'hi' })
    });
    assert.equal(response.status, 400);
    const body: any = await response.json();
    assert.equal(body.success, false);
    assert.match(body.error, /question/i);
  });

  it('rejects non-GitHub repository URLs before fetching files', async () => {
    const response = await fetch(baseUrl + '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl: 'https://example.com/owner/repo', question: 'Where is authentication handled?' })
    });
    assert.equal(response.status, 400);
    const body: any = await response.json();
    assert.equal(body.success, false);
    assert.match(body.error, /github\.com/i);
  });
});
