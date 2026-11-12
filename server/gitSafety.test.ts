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
    expect(checkAgentShellCommand('git -C /tmp push origin +feature', dev)).not.toBeNull();
    expect(checkAgentShellCommand('git -C /tmp push origin main', dev)).not.toBeNull();
    expect(checkAgentShellCommand('git push --no-verify origin feature', dev)).not.toBeNull();
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
  it('isolates the hook from the main checkout and worktree files, and blocks protected pushes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-git-safety-'));
    try {
      const main = path.join(root, 'main');
      const remote = path.join(root, 'remote.git');
      const wt = path.join(root, 'desk');
      await fs.mkdir(main);
      await git(['init', '--bare', remote], { cwd: root });
      await git(['init', '-b', 'main'], { cwd: main });
      await git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'init'], { cwd: main });
      await git(['remote', 'add', 'origin', remote], { cwd: main });
      await git(['worktree', 'add', '-b', 'feature', wt, 'HEAD'], { cwd: main });
      await installAgentGitHooks(wt, 'main');
      await expect(git(['config', '--get', 'core.hooksPath'], { cwd: main })).rejects.toThrow();
      const hooks = await git(['config', '--get', 'core.hooksPath'], { cwd: wt });
      expect(path.isAbsolute(hooks)).toBe(true);
      expect(await git(['status', '--porcelain'], { cwd: wt })).toBe('');
      await git(['add', '-A'], { cwd: wt });
      expect(await git(['diff', '--cached', '--name-only'], { cwd: wt })).toBe('');
      await git(['push', 'origin', 'HEAD:refs/heads/feature'], { cwd: wt });
      await expect(git(['push', 'origin', 'HEAD:refs/heads/main'], { cwd: wt })).rejects.toThrow(/cubefarm/);
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
