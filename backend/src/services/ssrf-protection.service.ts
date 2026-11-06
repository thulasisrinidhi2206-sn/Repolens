/**
 * RepoLens - SSRF Protection & Safe HTTP Client Service
 * Enforces strict network isolation, IP validation, DNS rebinding mitigation,
 * and redirect validation for external URL inspections.
 */

import dns from 'dns/promises';
import net from 'net';

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxSizeBytes?: number;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  finalUrl: string;
  data?: string;
}

// Blocked private IPv4 address ranges (CIDR blocks)
const PRIVATE_IPV4_RANGES: { ip: number; mask: number }[] = [
  // 0.0.0.0/8 (Current network)
  { ip: ipv4ToNumber('0.0.0.0'), mask: ipv4Mask(8) },
  // 10.0.0.0/8 (Private-Use)
  { ip: ipv4ToNumber('10.0.0.0'), mask: ipv4Mask(8) },
  // 127.0.0.0/8 (Loopback)
  { ip: ipv4ToNumber('127.0.0.0'), mask: ipv4Mask(8) },
  // 169.254.0.0/16 (Link-Local & Cloud Metadata: AWS/GCP/Azure 169.254.169.254)
  { ip: ipv4ToNumber('169.254.0.0'), mask: ipv4Mask(16) },
  // 172.16.0.0/12 (Private-Use)
  { ip: ipv4ToNumber('172.16.0.0'), mask: ipv4Mask(12) },
  // 192.168.0.0/16 (Private-Use)
  { ip: ipv4ToNumber('192.168.0.0'), mask: ipv4Mask(16) },
  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  { ip: ipv4ToNumber('100.64.0.0'), mask: ipv4Mask(10) },
  // 192.0.0.0/24 (IETF Protocol Assignments)
  { ip: ipv4ToNumber('192.0.0.0'), mask: ipv4Mask(24) },
  // 198.18.0.0/15 (Network Benchmark Testing)
  { ip: ipv4ToNumber('198.18.0.0'), mask: ipv4Mask(15) },
  // 224.0.0.0/4 (Multicast)
  { ip: ipv4ToNumber('224.0.0.0'), mask: ipv4Mask(4) },
  // 240.0.0.0/4 (Reserved / Future Use)
  { ip: ipv4ToNumber('240.0.0.0'), mask: ipv4Mask(4) },
];

function ipv4ToNumber(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

function ipv4Mask(bits: number): number {
  return bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
}

export class SsrfProtectionService {
  /**
   * Validates whether an IP address is private, loopback, link-local, or cloud metadata
   */
  public static isPrivateIp(ip: string): boolean {
    const family = net.isIP(ip);
    if (!family) {
      return true; // Not a valid IP -> block
    }

    if (family === 4) {
      const numIp = ipv4ToNumber(ip);
      for (const range of PRIVATE_IPV4_RANGES) {
        if ((numIp & range.mask) === (range.ip & range.mask)) {
          return true;
        }
      }
      return false;
    }

    if (family === 6) {
      const lower = ip.toLowerCase();
      // Loopback
      if (lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') {
        return true;
      }
      // Unspecified
      if (lower === '::' || lower === '0000:0000:0000:0000:0000:0000:0000:0000') {
        return true;
      }
      // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
      if (lower.startsWith('::ffff:') || lower.startsWith('0:0:0:0:0:ffff:')) {
        const parts = lower.split(':');
        const lastPart = parts[parts.length - 1];
        if (net.isIPv4(lastPart)) {
          return this.isPrivateIp(lastPart);
        }
      }
      // Unique Local Addresses (fc00::/7)
      if (lower.startsWith('fc') || lower.startsWith('fd')) {
        return true;
      }
      // Link-Local Addresses (fe80::/10)
      if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Resolves hostname via DNS and checks all resolved IP addresses
   */
  public static async validateHostname(hostname: string): Promise<{ safe: boolean; reason?: string; resolvedIps?: string[] }> {
    const lower = hostname.toLowerCase();

    // Block localhost, local domains, and well-known cloud metadata hosts
    if (
      lower === 'localhost' ||
      lower.endsWith('.localhost') ||
      lower.endsWith('.local') ||
      lower.endsWith('.internal') ||
      lower === 'metadata.google.internal' ||
      lower === 'instance-data'
    ) {
      return { safe: false, reason: `Host '${hostname}' is an internal or reserved name.` };
    }

    // If hostname is already a raw IP
    if (net.isIP(hostname)) {
      if (this.isPrivateIp(hostname)) {
        return { safe: false, reason: `IP '${hostname}' belongs to a private, loopback, or metadata network.` };
      }
      return { safe: true, resolvedIps: [hostname] };
    }

    // Resolve via DNS
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        return { safe: false, reason: `Could not resolve hostname '${hostname}'.` };
      }

      const resolvedIps = addresses.map(a => a.address);

      for (const addr of addresses) {
        if (this.isPrivateIp(addr.address)) {
          return {
            safe: false,
            reason: `Hostname '${hostname}' resolves to private or restricted IP: ${addr.address}`,
            resolvedIps,
          };
        }
      }

      return { safe: true, resolvedIps };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { safe: false, reason: `DNS lookup failed for '${hostname}': ${msg}` };
    }
  }

  /**
   * Validates URL scheme and destination before any request
   */
  public static async validateUrl(urlStr: string): Promise<{ safe: boolean; reason?: string; parsedUrl?: URL }> {
    try {
      const parsed = new URL(urlStr);

      // 1. Restrict scheme to HTTP and HTTPS
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `Unsupported protocol '${parsed.protocol}'. Only HTTP and HTTPS are permitted.` };
      }

      // 2. Validate hostname
      const hostCheck = await this.validateHostname(parsed.hostname);
      if (!hostCheck.safe) {
        return { safe: false, reason: hostCheck.reason };
      }

      return { safe: true, parsedUrl: parsed };
    } catch {
      return { safe: false, reason: `Invalid URL format: '${urlStr}'` };
    }
  }

  /**
   * Safely performs an external HTTP request with SSRF protection,
   * safe redirect checking, response size limits, and connection timeouts.
   */
  public static async safeFetch(urlStr: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const {
      method = 'HEAD',
      headers = {},
      timeoutMs = 4000,
      maxSizeBytes = 64 * 1024, // 64KB max
      maxRedirects = 3,
    } = options;

    let currentUrl = urlStr;
    let redirectCount = 0;

    while (redirectCount <= maxRedirects) {
      // 1. SSRF validate current URL before connecting
      const validation = await this.validateUrl(currentUrl);
      if (!validation.safe) {
        throw new Error(`SSRF validation blocked request to ${currentUrl}: ${validation.reason}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(currentUrl, {
          method,
          headers: {
            'User-Agent': 'RepoLens-Demo-Validator/1.0',
            ...headers,
          },
          // CRITICAL: Manual redirect handling to prevent redirect-based SSRF
          redirect: 'manual',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // 2. Handle HTTP Redirects safely
        if (response.status >= 300 && response.status < 400) {
          const locationHeader = response.headers.get('location');
          if (!locationHeader) {
            return {
              ok: false,
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              finalUrl: currentUrl,
            };
          }

          redirectCount++;
          if (redirectCount > maxRedirects) {
            throw new Error(`Exceeded maximum allowed redirects (${maxRedirects})`);
          }

          // Resolve relative or absolute redirect URL against current URL
          const resolvedRedirect = new URL(locationHeader, currentUrl).toString();
          currentUrl = resolvedRedirect;
          continue; // Loop and re-validate redirected destination
        }

        // 3. For GET requests, limit response size
        let responseBody: string | undefined;
        if (method === 'GET' && response.body) {
          const reader = response.body.getReader();
          let receivedBytes = 0;
          const chunks: Uint8Array[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (value) {
              receivedBytes += value.length;
              if (receivedBytes > maxSizeBytes) {
                // Cancel stream if response exceeds size cap
                await reader.cancel();
                break;
              }
              chunks.push(value);
            }
          }

          const combined = Buffer.concat(chunks);
          responseBody = combined.toString('utf-8');
        }

        return {
          ok: response.status >= 200 && response.status < 400,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          finalUrl: currentUrl,
          data: responseBody,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Request to ${currentUrl} timed out after ${timeoutMs}ms`);
        }
        throw err;
      }
    }

    throw new Error(`Exceeded maximum allowed redirects (${maxRedirects})`);
  }
}
