import { describe, expect, it } from 'vitest';
import { compatibleAgentRole } from './stateCompat.ts';

describe('compatibleAgentRole', () => {
  it('loads workers saved by versions that call developers agents', () => {
    expect(compatibleAgentRole('agent')).toBe('dev');
  });

  it('preserves roles understood by this version', () => {
    expect(compatibleAgentRole('dev')).toBe('dev');
    expect(compatibleAgentRole('qa')).toBe('qa');
    expect(compatibleAgentRole('ceo')).toBe('ceo');
  });
});
