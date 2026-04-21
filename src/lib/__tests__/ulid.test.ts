import { describe, it, expect, afterAll } from 'vitest';
import { newUlid, __setUlidPrng } from '../ulid';

describe('newUlid', () => {
  it('returns a 26-character string (P1)', () => {
    const id = newUlid();
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(26);
  });

  it('uses Crockford base32 alphabet (no I, L, O, U)', () => {
    const id = newUlid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('1000 sequential calls produce 1000 unique strings (P1 — monotonic + uniqueness)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(newUlid());
    }
    expect(ids.size).toBe(1000);
  });

  it('sequential calls within the same millisecond are strictly increasing (monotonic)', () => {
    const samples: string[] = [];
    for (let i = 0; i < 50; i++) {
      samples.push(newUlid());
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i] > samples[i - 1]).toBe(true);
    }
  });

  describe('__setUlidPrng (test-design hook #5)', () => {
    afterAll(() => __setUlidPrng(undefined));

    it('injecting a deterministic PRNG produces deterministic time-invariant randomness', () => {
      __setUlidPrng(() => 0);
      const a = newUlid();
      __setUlidPrng(() => 0);
      const b = newUlid();
      // Randomness portion (last 16 chars) is deterministic when the PRNG is fixed.
      expect(a.slice(-16)).toBe(b.slice(-16));
      __setUlidPrng(undefined);
    });
  });
});
