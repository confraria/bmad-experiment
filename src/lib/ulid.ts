import { monotonicFactory } from 'ulid';

type PrngFn = () => number;

let prng: PrngFn | undefined;
let factory = monotonicFactory(prng);

export function newUlid(): string {
  return factory();
}

export function __setUlidPrng(fn: PrngFn | undefined): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setUlidPrng is a test-only hook');
  }
  prng = fn;
  factory = monotonicFactory(prng);
}
