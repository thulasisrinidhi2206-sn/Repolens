/**
 * RepoLens - Docker Runtime & Container Isolation Service
 * Manages isolated, resource-constrained, non-privileged Docker containers for previews
 */

import { execFile, spawn } from 'child_process';
import net from 'net';
import path from 'path';

export interface ContainerStartOptions {
  previewId: string;
  workspacePath: string;
  port: number;
}

export interface ContainerStartResult {
  containerId: string;
  port: number;
  previewUrl: string;
}

export class DockerRuntimeService {
  private dockerCliPath: string = 'docker';

  /**
   * Verifies if Docker daemon is running and accessible
   */
  public async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile(this.dockerCliPath, ['info'], { timeout: 4000 }, (error) => {
        if (error) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Finds an available ephemeral TCP port on localhost
   */
  public async findAvailablePort(minPort: number = 31000, maxPort: number = 39000): Promise<number> {
    const isPortFree = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => {
          server.close(() => resolve(true));
        });
      });
    };

    // Try a random port in range first, then iterate
    for (let attempts = 0; attempts < 30; attempts++) {
      const candidate = Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort;
      if (await isPortFree(candidate)) {
        return candidate;
      }
    }

    // Sequential search fallback
    for (let port = minPort; port <= maxPort; port++) {
      if (await isPortFree(port)) {
        return port;
      }
    }

    throw new Error('No available port found in the specified range for preview runtime.');
  }

  /**
   * Starts a secure, sandboxed static web container (nginx:alpine) serving the isolated workspace
   */
  public async startStaticContainer(options: ContainerStartOptions): Promise<ContainerStartResult> {
    const { previewId, workspacePath, port } = options;
    const containerName = `repolens-preview-${previewId}`;

    // Normalize absolute path for Docker volume mounting on Windows/Linux
    const resolvedPath = path.resolve(workspacePath);

    const args = [
      'run',
      '-d',
      '--name', containerName,
      '--label', 'repolens.preview=true',
      '--label', `repolens.previewId=${previewId}`,
      // 1. Filesystem isolation: Mount workspace directory as READ-ONLY
      '-v', `${resolvedPath}:/usr/share/nginx/html:ro`,
      // 2. Network isolation: Bind ONLY to localhost (127.0.0.1), preventing external host access
      '-p', `127.0.0.1:${port}:80`,
      // 3. Resource limits
      '--cpus=0.5',
      '--memory=256m',
      '--memory-swap=256m',
      '--pids-limit=64',
      // 4. Privileges & Security capabilities
      '--security-opt=no-new-privileges',
      '--cap-drop=ALL',
      '--read-only',
      // 5. Minimal tmpfs for Nginx writable directories in read-only container
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=10m',
      '--tmpfs', '/var/run:rw,noexec,nosuid,size=5m',
      '--tmpfs', '/var/cache/nginx:rw,noexec,nosuid,size=20m',
      // 6. Image
      'nginx:alpine',
    ];

    return new Promise((resolve, reject) => {
      execFile(this.dockerCliPath, args, { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          const errMsg = stderr ? stderr.toString().trim() : error.message;
          return reject(new Error(`Failed to start isolated preview container: ${errMsg}`));
        }

        const containerId = stdout ? stdout.toString().trim().slice(0, 12) : containerName;
        const previewUrl = `http://localhost:${port}`;

        resolve({
          containerId,
          port,
          previewUrl,
        });
      });
    });
  }

  /**
   * Stops and removes a running preview container
   */
  public async stopContainer(previewId: string): Promise<boolean> {
    const containerName = `repolens-preview-${previewId}`;

    return new Promise((resolve) => {
      execFile(this.dockerCliPath, ['rm', '-f', containerName], { timeout: 8000 }, (error) => {
        if (error) {
          // If container didn't exist or already removed, resolve true
          resolve(true);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Runs an isolated build container (node:20-alpine) with resource limits, --ignore-scripts, and timeout
   */
  public async runContainerizedBuild(options: {
    previewId: string;
    workspacePath: string;
    buildCommand?: string;
    timeoutMs?: number;
  }): Promise<{ success: boolean; exitCode: number; logs: string[]; error?: string }> {
    const {
      previewId,
      workspacePath,
      buildCommand = 'npm install --no-audit --no-fund --ignore-scripts && (npm run build || npx vite build --outDir dist)',
      timeoutMs = 120000,
    } = options;

    const builderName = `repolens-builder-${previewId}`;
    const resolvedPath = path.resolve(workspacePath);

    const args = [
      'run',
      '--name', builderName,
      '--rm',
      '--label', 'repolens.preview=true',
      '--label', 'repolens.builder=true',
      // 1. Filesystem isolation: Mount workspace to /app
      '-v', `${resolvedPath}:/app:rw`,
      '-w', '/app',
      // 2. Resource & Process Limits
      '--cpus=1.0',
      '--memory=1024m',
      '--memory-swap=1024m',
      '--pids-limit=128',
      // 3. Privileges & Security capabilities
      '--security-opt=no-new-privileges',
      // 4. Clean environment: Zero host secrets/env vars leaked
      '-e', 'NODE_ENV=production',
      '-e', 'CI=true',
      // 5. Image & Command
      'node:20-alpine',
      'sh', '-c', buildCommand,
    ];

    return new Promise((resolve) => {
      execFile(
        this.dockerCliPath,
        args,
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const rawOutput = `${stdout || ''}\n${stderr || ''}`.trim();
          const sanitizedOutput = this.sanitizeBuildOutput(rawOutput, resolvedPath);
          const logs = sanitizedOutput.split('\n').filter(l => l.trim().length > 0);

          if (error) {
            // Handle timeout specifically
            if (error.killed) {
              // Ensure builder container is killed
              execFile(this.dockerCliPath, ['rm', '-f', builderName], () => {});
              return resolve({
                success: false,
                exitCode: 124,
                logs,
                error: `Build timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
              });
            }

            const cleanError = this.extractCleanErrorMessage(logs, error.message);
            return resolve({
              success: false,
              exitCode: typeof error.code === 'number' ? error.code : 1,
              logs,
              error: cleanError,
            });
          }

          resolve({
            success: true,
            exitCode: 0,
            logs,
          });
        }
      );
    });
  }

  /**
   * Fetches container logs safely
   */
  public async getContainerLogs(previewId: string, tailLines: number = 50): Promise<string[]> {
    const containerName = `repolens-preview-${previewId}`;

    return new Promise((resolve) => {
      execFile(this.dockerCliPath, ['logs', '--tail', String(tailLines), containerName], { timeout: 4000 }, (error, stdout, stderr) => {
        if (error) {
          return resolve([]);
        }
        const output = (stdout || stderr || '').toString();
        const lines = output.split('\n').filter(l => l.trim().length > 0);
        resolve(lines);
      });
    });
  }

  /**
   * Sanitizes raw build output to prevent exposing host paths, environment details, or credentials
   */
  public sanitizeBuildOutput(output: string, hostWorkspacePath: string): string {
    if (!output) return '';

    // Replace absolute host paths with generic container paths
    const normalizedHostPath = hostWorkspacePath.replace(/\\/g, '/');
    const escapedHostPath = normalizedHostPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hostRegex = new RegExp(escapedHostPath, 'gi');

    let sanitized = output.replace(hostRegex, '/app');

    // Also strip generic Windows / temporary directory patterns
    sanitized = sanitized.replace(/[A-Z]:\\[^\s:"'\n]+/gi, '/app');

    // Redact tokens and bearer credentials
    sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9_\-\.]+/gi, '$1[REDACTED]');
    sanitized = sanitized.replace(/(ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)/gi, '[REDACTED_TOKEN]');

    return sanitized;
  }

  /**
   * Extracts the most relevant compilation error message from build logs
   */
  private extractCleanErrorMessage(logs: string[], fallback: string): string {
    // Look for compiler or Vite error lines
    const errorLines = logs.filter(l =>
      /\berror\b/i.test(l) ||
      /\bfailed\b/i.test(l) ||
      /\bSyntaxError\b/i.test(l) ||
      /\bTypeScript\b/i.test(l) ||
      /\[vite\]/i.test(l)
    );

    if (errorLines.length > 0) {
      return errorLines.slice(-3).join(' | ');
    }

    return fallback;
  }
}

export const dockerRuntimeService = new DockerRuntimeService();


