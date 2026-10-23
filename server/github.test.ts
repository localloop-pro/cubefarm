import { describe, expect, it } from 'vitest';
import { checksOf } from './github.ts';

describe('checksOf', () => {
  it('is none with no rollup', () => {
    expect(checksOf(null)).toBe('none');
    expect(checksOf([])).toBe('none');
  });
  it('is none, never passing, when every check is neutral or skipped', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'NEUTRAL' }, { name: 'b', status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('none');
  });
  it('passes when a real check succeeded alongside skipped ones', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('passing');
  });
  it('fails and pends as before', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('failing');
    expect(checksOf([{ name: 'a', status: 'IN_PROGRESS' }])).toBe('pending');
  });
});
