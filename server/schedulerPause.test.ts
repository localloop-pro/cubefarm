import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoBackend } from './demo.ts';
import { Swarm } from './swarm.ts';

afterEach(() => vi.useRealTimers());

describe('manager scheduling pause', () => {
  it('holds queued CEO work and resumes it only after the manager releases the pause', () => {
    vi.useFakeTimers();
    const swarm = new Swarm(createDemoBackend());
    const internal = swarm as unknown as { schedule(): void; startCeoWork(): void; maybeHeartbeat(): void; officeUpdateTick(): boolean };
    vi.spyOn(internal, 'maybeHeartbeat').mockImplementation(() => {});
    vi.spyOn(internal, 'officeUpdateTick').mockReturnValue(false);
    const ceo = vi.spyOn(internal, 'startCeoWork').mockImplementation(() => {});
    swarm.updateSettings({ schedulingPaused: true });
    internal.schedule();
    expect(ceo).not.toHaveBeenCalled();
    swarm.updateSettings({ schedulingPaused: false });
    internal.schedule();
    expect(ceo).toHaveBeenCalledOnce();
  });

  it('does not resume interrupted agents or nudge them while paused', () => {
    vi.useFakeTimers();
    const swarm = new Swarm(createDemoBackend());
    const internal = swarm as unknown as { recover(agents: unknown[]): void; noPullRequest(agent: unknown, repo: unknown): void };
    const message = vi.spyOn(swarm, 'message').mockResolvedValue(undefined);
    swarm.updateSettings({ schedulingPaused: true });
    internal.recover([{ id: 'dev', task: 'issue', branch: 'swarm/issue-1', sessionId: 'saved' }]);
    internal.noPullRequest({ name: 'Dev', issueNumber: 1 }, { id: 'o/r' });
    expect(message).not.toHaveBeenCalled();
  });
});
