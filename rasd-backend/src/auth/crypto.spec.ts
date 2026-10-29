import { describe, expect, it } from 'vitest';
import { generateOtp, generateToken, hashOtp, hashPassword, hashToken, otpMatches, verifyPassword } from './crypto.js';

describe('password hashing', () => {
  it('round-trips a password without storing the plaintext', async () => {
    const stored = await hashPassword('Str0ngPass!23');
    expect(stored).not.toContain('Str0ngPass!23');
    expect(stored.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('Str0ngPass!23', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', stored)).resolves.toBe(false);
  });

  it('uses a fresh salt per hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(a).not.toEqual(b);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
  });
});

describe('tokens and OTPs', () => {
  it('generates unique opaque tokens and hashes them deterministically', () => {
    const first = generateToken();
    const second = generateToken();
    expect(first).not.toEqual(second);
    expect(hashToken(first)).toEqual(hashToken(first));
    expect(hashToken(first)).not.toContain(first);
  });

  it('generates 6-digit OTPs', () => {
    for (let i = 0; i < 25; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it('binds the OTP hash to the user id', () => {
    const hash = hashOtp('user-1', '123456');
    expect(hash).not.toContain('123456');
    expect(otpMatches('user-1', '123456', hash)).toBe(true);
    expect(otpMatches('user-2', '123456', hash)).toBe(false);
    expect(otpMatches('user-1', '654321', hash)).toBe(false);
  });
});
