import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DockerRuntimeService } from '../src/services/docker-runtime.service';

class MockDockerRuntimeService extends DockerRuntimeService {
  public commands: string[][] = [];
  public inspectResults: string[] = [];
  public runError?: Error;

  protected async executeDockerCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
    this.commands.push(args);

    if (args[0] === 'run') {
      if (this.runError) throw this.runError;
      return { stdout: '0123456789abcdef\n', stderr: '' };
    }
    if (args[0] === 'inspect') {
      return { stdout: `${this.inspectResults.shift() || ''}\n`, stderr: '' };
    }
    return { stdout: '', stderr: '' };
  }
}

describe('DockerRuntimeService static preview containers', () => {
  it('starts only after a healthy unprivileged Nginx container is running', async () => {
    const runtime = new MockDockerRuntimeService();
    runtime.inspectResults = ['running|healthy'];

    const result = await runtime.startStaticContainer({
      previewId: 'secure-preview',
      workspacePath: 'C:\\preview-workspace',
      port: 31742,
    });

    assert.deepEqual(result, {
      containerId: '0123456789ab',
      port: 31742,
      previewUrl: 'http://localhost:31742',
    });

    const args = runtime.commands[0];
    assert.ok(args.includes('--cap-drop=ALL'));
    assert.ok(args.includes('--security-opt=no-new-privileges'));
    assert.ok(args.includes('--read-only'));
    assert.ok(args.includes('--user=101:101'));
    assert.ok(args.includes('127.0.0.1:31742:8080'));
    assert.ok(args.includes('/tmp:rw,noexec,nosuid,size=20m,uid=101,gid=101,mode=1777'));
    assert.ok(args.includes('nginxinc/nginx-unprivileged:alpine'));
    assert.ok(runtime.commands.some(command => command[0] === 'inspect'));
    assert.equal(runtime.commands.some(command => command[0] === 'rm'), false);
  });

  it('rejects exited Nginx containers and removes them before returning failure', async () => {
    const runtime = new MockDockerRuntimeService();
    runtime.inspectResults = ['exited|starting'];

    await assert.rejects(
      runtime.startStaticContainer({
        previewId: 'exited-preview',
        workspacePath: 'C:\\preview-workspace',
        port: 31800,
      }),
      /stopped before becoming healthy/
    );

    assert.ok(runtime.commands.some(command => command[0] === 'rm' && command.includes('repolens-preview-exited-preview')));
  });

  it('rejects unhealthy Nginx containers and removes them before returning failure', async () => {
    const runtime = new MockDockerRuntimeService();
    runtime.inspectResults = ['running|unhealthy'];

    await assert.rejects(
      runtime.startStaticContainer({
        previewId: 'unhealthy-preview',
        workspacePath: 'C:\\preview-workspace',
        port: 31801,
      }),
      /failed its Docker health check/
    );

    assert.ok(runtime.commands.some(command => command[0] === 'rm' && command.includes('repolens-preview-unhealthy-preview')));
  });

  it('attempts container removal when Docker reports a startup error', async () => {
    const runtime = new MockDockerRuntimeService();
    runtime.runError = new Error('Docker run failed');

    await assert.rejects(
      runtime.startStaticContainer({
        previewId: 'startup-error-preview',
        workspacePath: 'C:\\preview-workspace',
        port: 31802,
      }),
      /Docker run failed/
    );

    assert.ok(runtime.commands.some(command => command[0] === 'rm' && command.includes('repolens-preview-startup-error-preview')));
  });
  it('checks availability and returns diagnostics', async () => {
    const runtime = new DockerRuntimeService();
    const result = await runtime.checkAvailability();
    assert.equal(typeof result.available, 'boolean');
    if (result.available) {
      assert.equal(result.error, undefined);
    } else {
      assert.ok(result.details && result.details.length > 0);
    }
  });
});