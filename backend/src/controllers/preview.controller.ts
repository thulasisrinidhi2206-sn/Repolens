import http from 'http';
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
    if (!session || (session.status !== 'ready' && session.status !== 'running') || !session.port) {
      sendError(res, 'Preview session not found or no longer running.', 404);
      return;
    }

    const relativePath = typeof req.params[0] === 'string' ? req.params[0] : '';
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
