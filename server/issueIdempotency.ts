import { HttpError } from './httpError.ts';

const KEY_PATTERN = /^[\w-]{8,128}$/;

export function validateIssueIdempotencyKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new HttpError(400, 'Invalid idempotency key');
  return key;
}

/** Preserve the difference between a missing legacy field and a supplied value of the wrong type. */
export function apiIssueIdempotencyKey(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid idempotency key');
  const key = value.trim();
  return key ? validateIssueIdempotencyKey(key) : undefined;
}
