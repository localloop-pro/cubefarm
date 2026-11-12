import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAgentShellCommand, installAgentGitHooks, opencodeBashPermissions, preToolUseForAgent } from './gitSafety.ts';
import { git } from './exec.ts';

const dev = { defaultBranch: 'main', role: 'dev' as const };
const qa = { defaultBranch: 'main', role: 'qa' as const };

describe('checkAgentShellCommand', () => {
  it('blocks push to default branch', () => {
    expect(checkAgentShellCommand('git push origin main', dev)).toMatch(/default branch/i);
    expect(checkAgentShellCommand('git push origin HEAD:main', dev)).toMatch(/default branch/i);
  });

  it('blocks force-push', () => {
    expect(checkAgentShellCommand('git push --force origin feature/x', dev)).toMatch(/force/i);
    expect(checkAgentShellCommand('git push -f origin feature/x', dev)).toMatch(/force/i);
  });

  it('blocks gh pr merge', () => {
    expect(checkAgentShellCommand('gh pr merge 12 --squash', dev)).toMatch(/merge/i);
    expect(checkAgentShellCommand('gh api repos/o/r/pulls/1/merge -X PUT', dev)).toMatch(/blocked|cubefarm|merge/i);
  });

  it('allows feature-branch push and pr create', () => {
    expect(checkAgentShellCommand('git push -u origin swarm/issue-1-ada', dev)).toBeNull();
    expect(checkAgentShellCommand('gh pr create --base main --head swarm/issue-1-ada', dev)).toBeNull();
    expect(checkAgentShellCommand('git status && npm test', dev)).toBeNull();
  });

  it('blocks QA from push, commit, and mutating gh', () => {
    expect(checkAgentShellCommand('git push origin qa-branch', qa)).toMatch(/must not push/i);
    expect(checkAgentShellCommand('git commit -m x', qa)).toMatch(/must not commit/i);
    expect(checkAgentShellCommand('gh pr comment 1 --body hi', qa)).toMatch(/GitHub/i);
    expect(checkAgentShellCommand('gh pr view 1', qa)).toBeNull();
    expect(checkAgentShellCommand('gh pr checks 1', qa)).toBeNull();
  });
});

describe('preToolUseForAgent', () => {
  it('denies bash that would push to main', () => {
    const out = preToolUseForAgent('Bash', { command: 'git push origin main' }, dev);
    expect(out).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });
});

describe('installAgentGitHooks', () => {
  it('blocks pre-push to main in the worktree', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-git-safety-'));
    try {
      await git(['init', '-b', 'main'], { cwd: root });
      await git(['commit', '--allow-empty', '-m', 'init'], { cwd: root });
      const wt = path.join(root, 'desk');
      await git(['worktree', 'add', '-b', 'feature', wt, 'HEAD'], { cwd: root });
      await installAgentGitHooks(wt, 'main');
      await git(['commit', '--allow-empty', '-m', 'work'], { cwd: wt });
      await expect(git(['push', 'origin', 'HEAD:refs/heads/main'], { cwd: wt })).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('opencodeBashPermissions', () => {
  it('denies dangerous git/gh patterns for dev', () => {
    const p = opencodeBashPermissions(dev);
    expect(p['gh pr merge *']).toBe('deny');
    expect(p['git push -f *']).toBe('deny');
    expect(p['*']).toBe('allow');
  });
});
