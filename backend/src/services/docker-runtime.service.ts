/**
 * RepoLens - Docker Runtime & Container Isolation Service
 * Manages isolated, resource-constrained, non-privileged Docker containers for previews
 */

import { execFile } from 'child_process';
import fs from 'fs';
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

export interface DockerAvailabilityResult {
  available: boolean;
  error?: string;
  details?: string;
}

interface DockerCommandResult {
  stdout: string;
  stderr: string;
}

export class DockerRuntimeService {
  private dockerCliPath: string;

  constructor(cliPath?: string) {
    this.dockerCliPath = cliPath || process.env.DOCKER_CLI_PATH || process.env.DOCKER_PATH || this.resolveDockerCli();
  }

  /**
   * Resolves the Docker CLI executable on the host system.
   * On Windows, prefers the direct docker.exe path if available to avoid shell script / PATH issues.
   */
  private resolveDockerCli(): string {
    if (process.platform === 'win32') {
      const candidates = [
        'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
        'docker.exe',
        'docker',
      ];
      for (const candidate of candidates) {
        if (candidate.includes('\\') && fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
    return 'docker';
  }

  /**
   * Checks whether Docker daemon is running and accessible with detailed diagnostics
   */
  public async checkAvailability(): Promise<DockerAvailabilityResult> {
    return new Promise((resolve) => {
      // 10-second timeout to allow Docker Desktop WSL engine or daemon wake-up
      execFile(this.dockerCliPath, ['info'], { timeout: 10000 }, (error, stdout, stderr) => {
        if (!error) {
          return resolve({ available: true });
        }

        const rawErr = (stderr || error.message || '').toString().trim();
        let errorDetails = rawErr;

        if (error.code === 'ENOENT') {
          errorDetails = `Docker CLI executable was not found at "${this.dockerCliPath}". Please ensure Docker is installed and in your PATH.`;
        } else if ((error as any).killed || error.signal === 'SIGTERM') {
          errorDetails = `Docker availability check timed out (10s). The Docker daemon may be unresponsive or busy.`;
        } else if (
          rawErr.includes('open //./pipe/dockerDesktopLinuxEngine') ||
          rawErr.includes('docker_engine') ||
          rawErr.includes('daemon is running') ||
          rawErr.includes('Is the docker daemon running')
        ) {
          errorDetails = `Docker daemon is not running or accessible. Please ensure Docker Desktop is started. (${rawErr.split('\n')[0]})`;
        } else if (rawErr.length > 0) {
          errorDetails = rawErr.split('\n')[0];
        }

        console.warn(`[DockerRuntimeService] Docker availability check failed: ${errorDetails}`);

        resolve({
          available: false,
          error: 'Docker container runtime is currently unavailable on the host system.',
          details: errorDetails,
        });
      });
    });
  }

  /**
   * Verifies if Docker daemon is running and accessible
   */
  public async isAvailable(): Promise<boolean> {
    const result = await this.checkAvailability();
    return result.available;
  }

  /**
   * Cleans up orphaned preview containers from previous backend runs or unexpected shutdowns
   */
  public async cleanupOrphanedContainers(): Promise<number> {
    const isReady = await this.isAvailable();
    if (!isReady) return 0;

    return new Promise((resolve) => {
      execFile(
        this.dockerCliPath,
        ['ps', '-aq', '--filter', 'label=repolens.preview=true'],
        { timeout: 8000 },
        (error, stdout) => {
          if (error || !stdout || stdout.trim().length === 0) {
            return resolve(0);
          }

          const containerIds = stdout
            .trim()
            .split(/\s+/)
            .filter(Boolean);

          if (containerIds.length === 0) return resolve(0);

          execFile(
            this.dockerCliPath,
            ['rm', '-f', ...containerIds],
            { timeout: 15000 },
            (rmErr) => {
              if (rmErr) {
                console.warn('[DockerRuntimeService] Warning during orphaned container cleanup:', rmErr.message);
              } else {
                console.log(`[DockerRuntimeService] Cleaned up ${containerIds.length} orphaned preview container(s).`);
              }
              resolve(containerIds.length);
            }
          );
        }
      );
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
   * Starts a secure, sandboxed static web container and waits for Nginx to become healthy.
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
      // nginx-unprivileged runs as UID/GID 101 and listens on 8080 without capabilities.
      '--user=101:101',
      // 1. Filesystem isolation: Mount workspace directory as READ-ONLY
      '-v', `${resolvedPath}:/usr/share/nginx/html:ro`,
      // 2. Network isolation: Bind ONLY to localhost (127.0.0.1), preventing external host access
      '-p', `127.0.0.1:${port}:8080`,
      // 3. Resource limits
      '--cpus=0.5',
      '--memory=256m',
      '--memory-swap=256m',
      '--pids-limit=64',
      // 4. Privileges & Security capabilities
      '--security-opt=no-new-privileges',
      '--cap-drop=ALL',
      '--read-only',
      // Keep Nginx PID and cache/temp paths writable without changing the read-only root filesystem.
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=20m,uid=101,gid=101,mode=1777',
      '--tmpfs', '/var/run:rw,noexec,nosuid,size=5m,uid=101,gid=101,mode=1777',
      '--tmpfs', '/var/cache/nginx:rw,noexec,nosuid,size=20m,uid=101,gid=101,mode=1777',
      '--health-cmd', 'wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1',
      '--health-interval=2s',
      '--health-timeout=2s',
      '--health-retries=5',
      '--health-start-period=2s',
      // 6. Image
      'nginxinc/nginx-unprivileged:alpine',
    ];

    try {
      const { stdout } = await this.executeDockerCommand(args, 120000);
      await this.waitForHealthyContainer(containerName);

      const containerId = stdout.trim().slice(0, 12) || containerName;
      const previewUrl = `http://localhost:${port}`;

      return {
        containerId,
        port,
        previewUrl,
      };
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'Unknown Docker startup error';

      try {
        await this.executeDockerCommand(['rm', '-f', containerName], 8000);
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        if (!/No such container|No such object/i.test(cleanupMessage)) {
          throw new Error(`Failed to start isolated preview container: ${failure}. Container cleanup also failed: ${cleanupMessage}`);
        }
      }

      throw new Error(`Failed to start isolated preview container: ${failure}`);
    }
  }

  /**
   * Stops and removes a running preview container
   */
  public async stopContainer(previewId: string): Promise<boolean> {
    const containerName = `repolens-preview-${previewId}`;

    try {
      await this.executeDockerCommand(['rm', '-f', containerName], 8000);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/No such container|No such object/i.test(message)) return true;

      console.error(`[DockerRuntimeService] Failed to remove preview container ${containerName}: ${message}`);
      return false;
    }
  }

  protected executeDockerCommand(args: string[], timeoutMs: number): Promise<DockerCommandResult> {
    return new Promise((resolve, reject) => {
      execFile(this.dockerCliPath, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          const message = stderr.toString().trim() || error.message;
          return reject(new Error(message));
        }
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      });
    });
  }

  private async waitForHealthyContainer(containerName: string, timeoutMs: number = 25000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const { stdout } = await this.executeDockerCommand([
        'inspect',
        '--format',
        '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
        containerName,
      ], 4000);
      const [state, health] = stdout.trim().split('|');

      if (state !== 'running') {
        throw new Error(`Preview container stopped before becoming healthy (state: ${state || 'unknown'}).`);
      }
      if (health === 'healthy') return;
      if (health === 'unhealthy') {
        throw new Error('Preview container failed its Docker health check.');
      }
      if (health !== 'starting') {
        throw new Error(`Preview container has an unexpected health state: ${health || 'unknown'}.`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Preview container did not become healthy within ${Math.round(timeoutMs / 1000)} seconds.`);
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
      buildCommand = 'npm install --include=dev --no-audit --no-fund --ignore-scripts && (npm run build || npx vite build --outDir dist)',
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
      '--cap-drop=ALL',
      '--read-only',
      '--tmpfs', '/tmp:rw,nosuid,size=512m',
      // 4. Clean environment: Zero host secrets/env vars leaked
      '-e', 'NODE_ENV=production',
      '-e', 'CI=true',
      '-e', 'HOME=/tmp',
      '-e', 'npm_config_cache=/tmp/npm-cache',
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
              return execFile(this.dockerCliPath, ['rm', '-f', builderName], (cleanupError) => {
                if (cleanupError && !/No such container|No such object/i.test(cleanupError.message)) {
                  console.error(`[DockerRuntimeService] Failed to remove timed-out builder ${builderName}: ${cleanupError.message}`);
                }
                resolve({
                  success: false,
                  exitCode: 124,
                  logs,
                  error: `Build timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
                });
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
