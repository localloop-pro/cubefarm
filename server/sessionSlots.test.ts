import { describe, expect, it } from 'vitest';
import { workerSlotsFull } from './sessionSlots.ts';

describe('workerSlotsFull', () => {
  it('never blocks when the session limit is off', () => {
    expect(workerSlotsFull(0, 99, false)).toBe(false);
  });

  it('reserves one slot for the CEO while she is free', () => {
    expect(workerSlotsFull(2, 0, false)).toBe(false);
    expect(workerSlotsFull(2, 1, false)).toBe(true);
    expect(workerSlotsFull(2, 1, true)).toBe(false);
    expect(workerSlotsFull(2, 2, true)).toBe(true);
  });

  it('with limit 1 keeps the only slot for the CEO when she is free', () => {
    expect(workerSlotsFull(1, 0, false)).toBe(true);
    expect(workerSlotsFull(1, 0, true)).toBe(false);
    expect(workerSlotsFull(1, 1, true)).toBe(true);
  });
});
