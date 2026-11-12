import { describe, expect, it } from 'vitest';
import { blockedCommand, prePushHook } from './gitSafety.ts';

describe('blockedCommand', () => {
  it.each([
    'git push origin main',
    'git push origin HEAD:main',
    'git push -u origin refs/heads/master',
    'git push --force origin feat',
    'git push -f',
    'git push --force-with-lease',
    'git push origin +feat',
    'git push --no-verify',
    'git push origin --delete feat',
    'npm test && git push origin main',
    'gh pr merge 12 --squash',
    'gh api repos/o/r/pulls/3/merge -X PUT',
  ])('blocks %s', (cmd) => expect(blockedCommand(cmd)).not.toBeNull());

  it.each(['git push -u origin swarm/issue-1', 'git push', 'git status', 'gh pr create --base main --head x', 'git log main'])(
    'allows %s',
    (cmd) => expect(blockedCommand(cmd)).toBeNull(),
  );

  it('blocks a custom default branch', () => {
    expect(blockedCommand('git push origin trunk', 'trunk')).not.toBeNull();
    expect(blockedCommand('git push origin trunk')).toBeNull();
  });
});

describe('prePushHook', () => {
  it('names the default branch', () => expect(prePushHook('trunk')).toContain('refs/heads/trunk'));
});
