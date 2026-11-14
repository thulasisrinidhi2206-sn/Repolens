import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { Request, Response } from 'express';
import { previewManagerService } from '../services/preview-manager.service';
import { previewService } from '../services/preview.service';
import { sendSuccess, sendError } from '../utils/response';

export class PreviewController {
  /**
   * Handles POST /api/preview requests
   */
  public async createPreview(req: Request, res: Response): Promise<void> {
    const { repositoryUrl } = req.body;

    const result = await previewService.createPreview(repositoryUrl, this.getPublicApiBaseUrl(req));

    if (!result.success || !result.data) {
      sendError(res, result.error || 'Failed to create preview', result.statusCode || 400);
      return;
    }

    sendSuccess(
      res,
      result.data,
      result.data.message || 'Preview created successfully',
      result.statusCode || 201
    );
  }

  /**
   * Proxies the isolated container through the public backend origin so previews
   * work for website and extension users without exposing host ports.
   */
  public async servePreview(req: Request, res: Response): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendError(res, 'Preview content only supports GET and HEAD requests.', 405);
      return;
    }

    const previewId = Array.isArray(req.params.previewId) ? req.params.previewId[0] : req.params.previewId;
    const session = previewManagerService.getSession(previewId);
    if (!session || (session.status !== 'ready' && session.status !== 'running')) {
      sendError(res, 'Preview session not found or no longer running.', 404);
      return;
    }

    const relativePath = typeof req.params[0] === 'string' ? req.params[0] : '';

    // Static previews are served from a bounded workspace; no Docker daemon or container port is needed.
    const staticWorkspace = previewManagerService.getWorkspacePath(previewId);
    if (staticWorkspace) {
      await this.serveStaticWorkspace(req, res, previewId, staticWorkspace, relativePath);
      return;
    }
    if (!session.port) {
      sendError(res, 'Preview session not found or no longer running.', 404);
      return;
    }
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const pathSegments = normalizedPath.split('/');
    if (normalizedPath.includes('\0') || pathSegments.some(segment => segment === '.' || segment === '..')) {
      sendError(res, 'Invalid preview content path.', 400);
      return;
    }

    const query = new URL(req.originalUrl, 'http://localhost').search;
    const encodedPath = pathSegments.map(segment => encodeURIComponent(segment)).join('/');
    const upstreamPath = `/${encodedPath}${query}`;
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: session.port,
      method: req.method,
      path: upstreamPath,
      headers: {
        Accept: req.get('accept') || '*/*',
        'User-Agent': 'RepoLens-Preview-Proxy',
      },
    }, upstreamResponse => {
      res.status(upstreamResponse.statusCode || 502);
      const contentType = upstreamResponse.headers['content-type'];
      if (contentType) res.setHeader('Content-Type', contentType);
      const cacheControl = upstreamResponse.headers['cache-control'];
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);

      const isHtml = typeof contentType === 'string' && contentType.toLowerCase().includes('text/html');
      const isCss = typeof contentType === 'string' && contentType.toLowerCase().includes('text/css');
      if (!isHtml && !isCss) {
        upstreamResponse.pipe(res);
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      upstreamResponse.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > 10 * 1024 * 1024) {
          upstreamResponse.destroy(new Error('Preview document exceeded the proxy size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      upstreamResponse.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf8');
        const contentPrefix = `/api/preview/${encodeURIComponent(previewId)}/content/`;
        const rewritten = isHtml
          ? rewritePreviewHtml(content, contentPrefix)
          : content.replace(/(url\(\s*["']?)\/(?!\/)/gi, `$1${contentPrefix}`);
        res.end(rewritten);
      });
      upstreamResponse.on('error', error => {
        if (!res.headersSent) sendError(res, error.message, 502);
        else res.destroy(error);
      });
    });

    upstream.on('error', error => {
      if (!res.headersSent) sendError(res, `Preview content is unavailable: ${error.message}`, 502);
      else res.destroy(error);
    });
    req.on('aborted', () => upstream.destroy());
    upstream.end();
  }

  private async serveStaticWorkspace(
    req: Request,
    res: Response,
    previewId: string,
    workspacePath: string,
    relativePath: string
  ): Promise<void> {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = normalized.split('/');
    if (normalized.includes('\0') || segments.some(segment => segment === '.' || segment === '..')) {
      sendError(res, 'Invalid preview content path.', 400);
      return;
    }

    try {
      const root = await fs.realpath(workspacePath);
      let target = path.resolve(root, normalized || 'index.html');
      if (target !== root && !target.startsWith(root + path.sep)) {
        sendError(res, 'Invalid preview content path.', 400);
        return;
      }

      let stat;
      try {
        stat = await fs.stat(target);
      } catch {
        // Support client-side routes in static single-page applications.
        if (path.extname(target)) {
          sendError(res, 'Preview file not found.', 404);
          return;
        }
        target = path.join(root, 'index.html');
        stat = await fs.stat(target);
      }
      if (stat.isDirectory()) {
        target = path.join(target, 'index.html');
        stat = await fs.stat(target);
      }
      if (!stat.isFile()) {
        sendError(res, 'Preview file not found.', 404);
        return;
      }

      const realTarget = await fs.realpath(target);
      if (realTarget !== root && !realTarget.startsWith(root + path.sep)) {
        sendError(res, 'Invalid preview content path.', 400);
        return;
      }

      const extension = path.extname(realTarget).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
        '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
        '.xml': 'application/xml', '.pdf': 'application/pdf', '.mp4': 'video/mp4',
        '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
      };
      const contentType = mimeTypes[extension] || 'application/octet-stream';
      let content: Buffer | string = await fs.readFile(realTarget);
      const prefix = `/api/preview/${encodeURIComponent(previewId)}/content/`;
      if (extension === '.html' || extension === '.htm') {
        content = rewritePreviewHtml(content.toString('utf8'), prefix);
      } else if (extension === '.css') {
        content = content.toString('utf8').replace(/(url\(\s*["']?)\/(?!\/)/gi, `$1${prefix}`);
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200);
      if (req.method === 'HEAD') res.end();
      else res.send(content);
    } catch (error) {
      if (!res.headersSent) sendError(res, 'Preview content is unavailable.', 404);
      else res.destroy(error instanceof Error ? error : undefined);
    }
  }

  /**
   * Handles GET /api/preview/:previewId requests
   */
  public async getPreviewStatus(req: Request, res: Response): Promise<void> {
    const previewId = Array.isArray(req.params.previewId) ? req.params.previewId[0] : req.params.previewId;

    const result = await previewService.getPreview(previewId);

    if (!result.success || !result.data) {
      sendError(res, result.error || 'Preview session not found', result.statusCode || 404);
      return;
    }

    sendSuccess(
      res,
      result.data,
      result.data.message || 'Preview status retrieved',
      result.statusCode || 200
    );
  }

  /**
   * Handles DELETE /api/preview/:previewId (stop preview and cleanup)
   */
  public async stopPreview(req: Request, res: Response): Promise<void> {
    const previewId = Array.isArray(req.params.previewId) ? req.params.previewId[0] : req.params.previewId;

    const result = await previewService.stopPreview(previewId);

    if (!result.success || !result.data) {
      sendError(res, result.error || 'Failed to stop preview session', result.statusCode || 404);
      return;
    }

    sendSuccess(
      res,
      result.data,
      result.data.message || 'Preview session stopped successfully',
      result.statusCode || 200
    );
  }

  private getPublicApiBaseUrl(req: Request): string {
    const configuredBaseUrl = process.env.PREVIEW_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL;
    if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, '');

    const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
    const protocol = forwardedProtocol || req.protocol;
    const host = req.get('host') || 'localhost:3001';
    return `${protocol}://${host}`;
  }
}

function rewritePreviewHtml(html: string, contentPrefix: string): string {
  const escapedPrefix = contentPrefix.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const baseTag = `<base href="${escapedPrefix}">`;
  const withoutBase = html.replace(/<base\b[^>]*>/i, '');
  const rewritten = withoutBase.replace(
    /(\b(?:src|href|action|poster|data)=["'])\/(?!\/)/gi,
    `$1${contentPrefix}`
  );
  return rewritten.replace(/<head\b[^>]*>/i, match => `${match}${baseTag}`);
}

export const previewController = new PreviewController();
