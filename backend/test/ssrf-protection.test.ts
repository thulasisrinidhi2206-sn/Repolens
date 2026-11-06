import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SsrfProtectionService } from '../src/services/ssrf-protection.service';

describe('SsrfProtectionService', () => {
  it('should identify loopback and private IPv4 addresses as unsafe', () => {
    assert.equal(SsrfProtectionService.isPrivateIp('127.0.0.1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('127.0.1.5'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('0.0.0.0'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('10.0.0.1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('172.16.0.1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('172.31.255.255'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('192.168.1.1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('100.64.0.1'), true);
  });

  it('should identify cloud metadata endpoint 169.254.169.254 as unsafe', () => {
    assert.equal(SsrfProtectionService.isPrivateIp('169.254.169.254'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('169.254.1.1'), true);
  });

  it('should identify private IPv6 addresses as unsafe', () => {
    assert.equal(SsrfProtectionService.isPrivateIp('::1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('::'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('fc00::1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('fd12:3456:789a:1::1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('fe80::1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('::ffff:127.0.0.1'), true);
    assert.equal(SsrfProtectionService.isPrivateIp('::ffff:169.254.169.254'), true);
  });

  it('should allow legitimate public IPv4 addresses', () => {
    assert.equal(SsrfProtectionService.isPrivateIp('8.8.8.8'), false);
    assert.equal(SsrfProtectionService.isPrivateIp('1.1.1.1'), false);
    assert.equal(SsrfProtectionService.isPrivateIp('140.82.121.4'), false); // GitHub
  });

  it('should block localhost and internal domain names', async () => {
    const localhostCheck = await SsrfProtectionService.validateHostname('localhost');
    assert.equal(localhostCheck.safe, false);

    const localCheck = await SsrfProtectionService.validateHostname('myapp.local');
    assert.equal(localCheck.safe, false);

    const metadataCheck = await SsrfProtectionService.validateHostname('metadata.google.internal');
    assert.equal(metadataCheck.safe, false);
  });

  it('should reject non-HTTP/HTTPS protocols', async () => {
    const ftp = await SsrfProtectionService.validateUrl('ftp://example.com/file.txt');
    assert.equal(ftp.safe, false);
    assert.match(ftp.reason || '', /Unsupported protocol/);

    const file = await SsrfProtectionService.validateUrl('file:///etc/passwd');
    assert.equal(file.safe, false);

    const gopher = await SsrfProtectionService.validateUrl('gopher://127.0.0.1:70');
    assert.equal(gopher.safe, false);
  });

  it('should reject URLs pointing directly to private IPs or metadata', async () => {
    const metadataUrl = await SsrfProtectionService.validateUrl('http://169.254.169.254/latest/meta-data/');
    assert.equal(metadataUrl.safe, false);

    const localUrl = await SsrfProtectionService.validateUrl('http://127.0.0.1:3001/api/preview');
    assert.equal(localUrl.safe, false);
  });
});
