import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { HOME_DIR } from './config.ts';
import { hasCliRoute, lostConversation, reconnectClis, resumableSession } from './cliRunner.ts';
import type { AgentTerminal } from './terminal.ts';
import { adoptPty, startKeeper } from './ptyClient.ts';

vi.mock('./ptyClient.ts', async (original) => ({
  ...await original<typeof import('./ptyClient.ts')>(), startKeeper: vi.fn(), adoptPty: vi.fn(),
}));

describe('hasCliRoute', () => {
  it('refuses unknown or malformed tokens without starting a keeper', () => {
    for (const token of ['', 'unknown', '../token', 'token%2fx']) {
      expect(hasCliRoute(token, 'hooks')).toBe(false);
      expect(hasCliRoute(token, 'mcp')).toBe(false);
    }
    expect(startKeeper).not.toHaveBeenCalled();
  });

  it('finds a reconnected hook token without invoking its hook or granting office tools', async () => {
    vi.useFakeTimers();
    try {
      let exited: (code: number) => void = () => undefined;
      const term = { bind: vi.fn(), note: vi.fn(), cols: 80, rows: 24 } as unknown as AgentTerminal;
      vi.mocked(startKeeper).mockResolvedValueOnce([{
        id: 'held', pid: 123, exit: null,
        meta: { agentId: 'ada', cli: 'claude', token: 'reconnected-hook', dir: path.join(HOME_DIR, 'route-lookup-test'), busy: false },
      }]);
      vi.mocked(adoptPty).mockReturnValueOnce({ pid: 123, write: vi.fn(), resize: vi.fn(), kill: vi.fn(), setMeta: vi.fn(), onData: vi.fn(), onExit: (fn) => { exited = fn; } });
      await reconnectClis(() => term);
      expect(hasCliRoute('reconnected-hook', 'hooks')).toBe(true);
      expect(hasCliRoute('reconnected-hook', 'mcp')).toBe(false);
      expect(term.note).not.toHaveBeenCalled();
      exited(0);
      expect(hasCliRoute('reconnected-hook', 'hooks')).toBe(false);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

describe('resumableSession', () => {
  const onDisk = (files: string[]) => (file: string) => files.includes(file);
  const hook = { hook_event_name: 'PreToolUse', session_id: 'abc', transcript_path: 'abc.jsonl' };

  it("keeps the session once Claude Code's conversation file exists", () => {
    expect(resumableSession(hook, onDisk(['abc.jsonl']))).toBe('abc');
  });

  it("doesn't keep it while the file isn't written yet (SessionStart, UserPromptSubmit)", () => {
    expect(resumableSession({ ...hook, hook_event_name: 'UserPromptSubmit' }, onDisk([]))).toBeNull();
  });

  it("doesn't keep it from a call with no transcript path (the status line) or no session", () => {
    expect(resumableSession({ hook_event_name: 'StatusLine', session_id: 'abc' }, () => true)).toBeNull();
    expect(resumableSession({ hook_event_name: 'Stop', transcript_path: 'abc.jsonl' }, () => true)).toBeNull();
  });
});

describe('lostConversation', () => {
  it("spots Claude Code's message for a resume with nothing to resume", () => {
    expect(lostConversation('\n No conversation found with session ID: 6cc74c7e-0c81-4bff-a140-cc8307c1d11b\n')).toBe(true);
  });

  it('ignores other screens', () => {
    expect(lostConversation('Claude Code v2.1.280\n❯ ')).toBe(false);
  });
});
