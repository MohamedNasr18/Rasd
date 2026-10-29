import { describe, it, expect } from 'vitest';
import { isPrivateAddress, isPublicUrl } from './url-guard.js';

describe('isPrivateAddress', () => {
  it('flags loopback and private IPv4 ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('allows public IPv4 addresses', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it('flags private IPv6 addresses', () => {
    for (const ip of ['::1', '::', 'fd00::1', 'fe80::1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
});

describe('isPublicUrl', () => {
  it('rejects non-http protocols', async () => {
    expect(await isPublicUrl('file:///etc/passwd')).toBe(false);
    expect(await isPublicUrl('ftp://example.com')).toBe(false);
  });

  it('rejects local and metadata hosts', async () => {
    expect(await isPublicUrl('http://localhost:3000')).toBe(false);
    expect(await isPublicUrl('http://app.localhost')).toBe(false);
    expect(await isPublicUrl('http://metadata.google.internal')).toBe(false);
    expect(await isPublicUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(await isPublicUrl('http://[::1]/')).toBe(false);
  });

  it('accepts public IP literals', async () => {
    expect(await isPublicUrl('https://8.8.8.8/')).toBe(true);
  });
});
