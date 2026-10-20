import { describe, expect, it } from 'vitest';
import { mayReserveSlot, type SlotRequest } from './sessionSlots.ts';

const may = (r: Partial<SlotRequest>) => mayReserveSlot({ sessionLimit: 4, active: 0, ceoIdle: true, requester: 'worker', ...r });

describe('mayReserveSlot', () => {
  it('limit 0 is unlimited for everyone', () => {
    expect(may({ sessionLimit: 0, active: 1000 })).toBe(true);
    expect(may({ sessionLimit: 0, active: 1000, ceoIdle: false })).toBe(true);
    expect(may({ sessionLimit: 0, active: 1000, requester: 'ceo' })).toBe(true);
  });

  it('limit 1 with an idle CEO: only the CEO', () => {
    expect(may({ sessionLimit: 1, active: 0 })).toBe(false);
    expect(may({ sessionLimit: 1, active: 0, requester: 'ceo' })).toBe(true);
    expect(may({ sessionLimit: 1, active: 1, requester: 'ceo' })).toBe(false);
  });

  it('limit 1 with a busy CEO: full', () => {
    expect(may({ sessionLimit: 1, active: 1, ceoIdle: false })).toBe(false);
    expect(may({ sessionLimit: 1, active: 0, ceoIdle: false })).toBe(true);
  });

  it('limit N with an idle CEO: workers stop at N-1, the CEO takes the reserved slot', () => {
    expect(may({ active: 2 })).toBe(true);
    expect(may({ active: 3 })).toBe(false);
    expect(may({ active: 3, requester: 'ceo' })).toBe(true);
    expect(may({ active: 4, requester: 'ceo' })).toBe(false);
  });

  it('limit N with a busy CEO: workers use up to N', () => {
    expect(may({ active: 3, ceoIdle: false })).toBe(true);
    expect(may({ active: 4, ceoIdle: false })).toBe(false);
    expect(may({ active: 5, ceoIdle: false })).toBe(false);
    expect(may({ active: 3, ceoIdle: false, requester: 'ceo' })).toBe(true);
    expect(may({ active: 4, ceoIdle: false, requester: 'ceo' })).toBe(false);
  });

  it('fails closed on bad input', () => {
    for (const bad of [-1, 1.5, NaN, Infinity]) {
      expect(may({ sessionLimit: bad })).toBe(false);
      expect(may({ active: bad, requester: 'ceo' })).toBe(false);
    }
    expect(may({ requester: 'boss' as never })).toBe(false);
    expect(may({ ceoIdle: undefined as never })).toBe(false);
  });
});
