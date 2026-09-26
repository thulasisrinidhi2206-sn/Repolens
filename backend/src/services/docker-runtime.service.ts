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
}

export const dockerRuntimeService = new DockerRuntimeService();

