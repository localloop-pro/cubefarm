/** Technical git/GitHub guardrails for agent worktrees and shell tool calls (issue #80). */

import fs from 'node:fs/promises';
import path from 'node:path';
import { git } from './exec.ts';

/** Branch names refused in a shell command even when the default branch isn't known there. */
const PROTECTED = ['main', 'master'];

/** Splits a shell command into its simple commands (`a && b | c; d`), each as words with quotes removed. */
function simpleCommands(cmd: string): string[][] {
  return cmd
    .split(/&&|\|\||[;|\n]/)
    .map((part) => (part.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^["']|["']$/g, '')))
    .filter((w) => w.length);
}

const isProtectedRef = (ref: string, extra: string[]) => {
  const dst = ref.replace(/^\+/, '').split(':').pop() ?? '';
  return [...PROTECTED, ...extra].includes(dst.replace(/^refs\/heads\//, ''));
};

/** Why a shell command breaks the rules, or null when it doesn't. */
export function blockedCommand(cmd: string, defaultBranch?: string): string | null {
  const extra = defaultBranch ? [defaultBranch] : [];
  for (const words of simpleCommands(cmd)) {
    const i = words.findIndex((w) => w === 'git' || w === 'gh');
    if (i < 0) continue;
    const rest = words.slice(i);
    if (rest[0] === 'gh') {
      const sub = rest.filter((w) => !w.startsWith('-')).slice(1, 3).join(' ');
      if (sub === 'pr merge') return 'Merging pull requests is not allowed; the office merges them once QA passes.';
      if (rest[1] === 'api' && rest.some((w) => /\/(merges|pulls\/\d+\/merge)\b/.test(w))) return 'Merging through the GitHub API is not allowed.';
      continue;
    }
    const pushAt = rest.indexOf('push');
    if (pushAt < 0) continue;
    const args = rest.slice(pushAt + 1);
    if (args.some((a) => a === '--force' || a === '-f' || a.startsWith('--force-with-lease') || a === '--mirror' || (/^-[a-zA-Z]+$/.test(a) && a.includes('f')))) {
      return 'Force-pushing is not allowed.';
    }
    if (args.includes('--no-verify')) return 'git push --no-verify is not allowed: it skips the safety hook.';
    if (args.some((a) => a === '--delete' || a === '-d')) return 'Deleting remote branches is not allowed.';
    const positional = args.filter((a) => !a.startsWith('-'));
    if (positional.slice(1).some((r) => r.startsWith('+') || isProtectedRef(r, extra))) {
      return `Pushing to ${defaultBranch ?? 'the default branch'} is not allowed; push your own branch and open a pull request.`;
    }
  }
  return null;
}

export interface GitSafetyPolicy {
  defaultBranch: string;
  role: 'dev' | 'qa' | 'ceo';
}

const FORCE_PUSH =
  /(?:--force-with-lease|--force-if-includes|--force(?:\s|$)|(?:^|\s)-f(?:\s|$))/;

/** Split a shell one-liner into individual commands (best-effort; not a full shell parser). */
export function splitShellCommands(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (ch === '|' || ch === '\n')) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    } else if (!inSingle && !inDouble && ch === ';') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    } else if (!inSingle && !inDouble && ch === '&' && command[i + 1] === '&') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length ? parts : [command.trim()];
}

function escRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function targetsDefaultBranch(fragment: string, defaultBranch: string): boolean {
  const b = escRe(defaultBranch);
  if (new RegExp(`(^|\\s)${b}(\\s|$)`, 'i').test(fragment)) return true;
  if (new RegExp(`HEAD:${b}(\\s|$)|:${b}(\\s|$)|refs/heads/${b}(\\s|$)`, 'i').test(fragment)) return true;
  return false;
}

function checkGitPush(fragment: string, policy: GitSafetyPolicy): string | null {
  if (!/\bgit\s+push\b/i.test(fragment)) return null;
  if (policy.role === 'qa') return 'QA agents must not push (the office posts your report).';
  if (FORCE_PUSH.test(fragment)) return 'Force-push is blocked by cubefarm.';
  if (targetsDefaultBranch(fragment, policy.defaultBranch)) {
    return `Pushing to the default branch (${policy.defaultBranch}) is blocked by cubefarm. Push your feature branch instead.`;
  }
  return null;
}

function checkGh(fragment: string, policy: GitSafetyPolicy): string | null {
  if (!/\bgh\b/i.test(fragment)) return null;
  if (policy.role === 'qa') {
    if (/\bgh\s+(pr\s+(comment|review|merge|close|edit|ready|reopen|update-branch)|api\b|repo\s+sync)\b/i.test(fragment)) {
      return 'QA agents must not change anything on GitHub (the office posts your report).';
    }
    return null;
  }
  if (/\bgh\s+pr\s+merge\b/i.test(fragment)) return 'Merging pull requests is blocked by cubefarm (the office merges after QA).';
  if (/\bgh\s+api\b/i.test(fragment) && /\bmerge\b/i.test(fragment)) {
    return 'Merging via the GitHub API is blocked by cubefarm.';
  }
  return null;
}

function checkGitWrite(fragment: string, policy: GitSafetyPolicy): string | null {
  if (policy.role !== 'qa') return null;
  if (/\bgit\s+commit\b/i.test(fragment)) return 'QA agents must not commit in the worktree under test.';
  if (/\bgit\s+push\b/i.test(fragment)) return 'QA agents must not push.';
  return null;
}

/** Returns a denial reason, or null when the command is allowed. */
export function checkAgentShellCommand(command: string, policy: GitSafetyPolicy): string | null {
  if (policy.role === 'ceo') return 'The CEO runs through office tools only.';
  const text = command.trim();
  if (!text) return null;
  for (const part of splitShellCommands(text)) {
    const reason =
      checkGitPush(part, policy) ?? checkGh(part, policy) ?? checkGitWrite(part, policy) ?? checkGitMergePush(part, policy);
    if (reason) return reason;
  }
  return blockedCommand(command, policy.defaultBranch);
}

function checkGitMergePush(fragment: string, policy: GitSafetyPolicy): string | null {
  if (policy.role === 'qa') return null;
  if (!/\bgit\s+push\b/i.test(fragment)) return null;
  // Pushing after merging default locally still hits pre-push; this catches explicit merge+push wording in one segment.
  if (/\bgit\s+merge\b/i.test(fragment) && targetsDefaultBranch(fragment, policy.defaultBranch)) {
    return 'Merging into the default branch and pushing is blocked by cubefarm.';
  }
  return null;
}

/** Claude / Codex PreToolUse decision objects. */
export function denyPreToolUse(reason: string): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

export const allowPreToolUse = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: 'Approved by cubefarm',
  },
};

export function preToolUseForAgent(toolName: string, input: Record<string, unknown>, policy: GitSafetyPolicy): Record<string, unknown> {
  if (policy.role === 'qa' && (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'NotebookEdit' || toolName === 'apply_patch')) {
    return denyPreToolUse('QA agents must not modify the code under test.');
  }
  if (toolName === 'Bash' || toolName === 'PowerShell' || toolName === 'shell') {
    const reason = checkAgentShellCommand(String(input.command ?? ''), policy);
    if (reason) return denyPreToolUse(reason);
  }
  if (toolName === 'apply_patch' && policy.role === 'qa') {
    return denyPreToolUse('QA agents must not modify the code under test.');
  }
  return allowPreToolUse;
}

/** OpenCode `permission.bash` map: deny dangerous commands; everything else stays allowed. */
export function opencodeBashPermissions(policy: GitSafetyPolicy): Record<string, 'allow' | 'deny'> {
  const deny: Record<string, 'deny'> = {
    'git push --force *': 'deny',
    'git push -f *': 'deny',
    'git push --force-with-lease *': 'deny',
    'git push --force-if-includes *': 'deny',
    [`git push origin ${policy.defaultBranch} *`]: 'deny',
    [`git push origin HEAD:${policy.defaultBranch} *`]: 'deny',
    [`git push * ${policy.defaultBranch} *`]: 'deny',
    'gh pr merge *': 'deny',
    'gh api *merge*': 'deny',
  };
  if (policy.role === 'qa') {
    Object.assign(deny, {
      'git commit *': 'deny',
      'git push *': 'deny',
      'gh pr comment *': 'deny',
      'gh pr review *': 'deny',
      'gh pr merge *': 'deny',
      'gh pr close *': 'deny',
      'gh pr edit *': 'deny',
      'gh api *': 'deny',
    });
  }
  return { ...deny, '*': 'allow' };
}

/** The pre-push hook: refuses the default branch, deletions and anything that isn't a fast-forward. */
export function prePushHook(defaultBranch: string): string {
  const branch = defaultBranch.replace(/[^\w./-]/g, '');
  return `#!/bin/sh
# Installed by cubefarm: agents may not push to the default branch or force-push.
zero=0000000000000000000000000000000000000000
while read local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/${branch}|refs/heads/main|refs/heads/master)
      echo "cubefarm: pushing to $remote_ref is not allowed. Push your own branch and open a pull request." >&2
      exit 1 ;;
  esac
  if [ "$local_sha" = "$zero" ]; then
    echo "cubefarm: deleting remote branches is not allowed." >&2
    exit 1
  fi
  if [ "$remote_sha" != "$zero" ] && ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    echo "cubefarm: force-pushes are not allowed (fetch and merge or rebase instead)." >&2
    exit 1
  fi
done
exit 0
`;
}

/** Points the desk's worktree at a hooks folder holding the pre-push guard (per worktree: the main checkout is untouched). */
export async function installAgentGitHooks(desk: string, defaultBranch: string): Promise<void> {
  const gitDir = path.resolve(desk, (await git(['rev-parse', '--git-dir'], { cwd: desk })).trim());
  const hooks = path.join(gitDir, 'cubefarm-hooks');
  await fs.mkdir(hooks, { recursive: true });
  await fs.writeFile(path.join(hooks, 'pre-push'), prePushHook(defaultBranch), { mode: 0o755 });
  await git(['config', 'extensions.worktreeConfig', 'true'], { cwd: desk });
  await git(['config', '--worktree', 'core.hooksPath', hooks], { cwd: desk });
}
