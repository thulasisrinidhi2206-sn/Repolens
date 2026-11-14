import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../src/app';
describe('Issue-to-Code Navigator API validation', () => {
  let server: http.Server; let baseUrl: string;
  before(async () => { await new Promise<void>(resolve => { server=app.listen(0,'127.0.0.1',()=>{const address=server.address() as any;baseUrl='http://127.0.0.1:'+address.port;resolve();}); }); });
  after(async () => { await new Promise<void>(resolve => server.close(()=>resolve())); });
  async function post(body: unknown) { return fetch(baseUrl+'/api/issue-navigator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
  it('rejects a missing repository URL', async () => { const response=await post({issueNumber:42}); assert.equal(response.status,400); const body:any=await response.json(); assert.match(body.error,/repositoryUrl/i); });
  it('rejects a non-positive issue number', async () => { const response=await post({repositoryUrl:'https://github.com/facebook/react',issueNumber:0}); assert.equal(response.status,400); const body:any=await response.json(); assert.match(body.error,/issueNumber/i); });
  it('rejects a non-integer issue number', async () => { const response=await post({repositoryUrl:'https://github.com/facebook/react',issueNumber:1.5}); assert.equal(response.status,400); const body:any=await response.json(); assert.match(body.error,/issueNumber/i); });
  it('rejects a non-GitHub repository URL', async () => { const response=await post({repositoryUrl:'https://example.com/owner/repo',issueNumber:42}); assert.equal(response.status,400); const body:any=await response.json(); assert.match(body.error,/github\.com/i); });
});
