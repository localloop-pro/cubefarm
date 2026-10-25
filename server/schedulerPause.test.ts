import fs from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import { STATE_FILE } from './config.ts';
import { schedulerPausedOnStart, Swarm } from './swarm.ts';

describe('schedulerPausedOnStart', () => {
  it('defaults to false', () => {
    expect(schedulerPausedOnStart(undefined, {})).toBe(false);
    expect(schedulerPausedOnStart(false, {})).toBe(false);
  });

  it('SWARM_START_PAUSED=1 forces true', () => {
    expect(schedulerPausedOnStart(false, { SWARM_START_PAUSED: '1' })).toBe(true);
    expect(schedulerPausedOnStart(false, { SWARM_START_PAUSED: '0' })).toBe(false);
  });

  it('a stored true survives a restart with the env unset or 0', () => {
    expect(schedulerPausedOnStart(true, {})).toBe(true);
    expect(schedulerPausedOnStart(true, { SWARM_START_PAUSED: '0' })).toBe(true);
  });

  it('only a real boolean true counts as stored', () => {
    expect(schedulerPausedOnStart('true', {})).toBe(false);
  });
});

describe('Swarm.setSchedulerPaused', () => {
  it('persists through the state file and survives a restart', async () => {
    vi.useFakeTimers();
    try {
      const backend = new Proxy({}, { get: () => () => undefined }) as unknown as Backend;
      const s = new Swarm(backend);
      expect(s.setSchedulerPaused(true).schedulerPaused).toBe(true);
      await (s as unknown as { writeState(): Promise<void> }).writeState();
      const saved = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) as { settings: { schedulerPaused: unknown } };
      expect(saved.settings.schedulerPaused).toBe(true);
      expect(schedulerPausedOnStart(saved.settings.schedulerPaused, {})).toBe(true);
      expect(s.setSchedulerPaused(false).schedulerPaused).toBe(false);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
