import { describe, expect, it } from 'vitest';
import { checksOf } from './github.ts';

describe('CI evidence', () => {
  it('does not treat absent, skipped or neutral checks as successful verification', () => {
    for (const checks of [null, [], [{ status: 'COMPLETED', conclusion: 'SKIPPED' }], [{ status: 'COMPLETED', conclusion: 'NEUTRAL' }]]) {
      expect(checksOf(checks)).toBe('none');
    }
  });
  it('requires an explicit successful check and still respects failures and pending work', () => {
    expect(checksOf([{ status: 'COMPLETED', conclusion: 'SUCCESS' }])).toBe('passing');
    expect(checksOf([{ state: 'SUCCESS' }])).toBe('passing');
    expect(checksOf([{ state: 'SUCCESS' }, { state: 'PENDING' }])).toBe('pending');
    expect(checksOf([{ state: 'SUCCESS' }, { status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('failing');
  });
});
