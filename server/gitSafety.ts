/** Technical git/GitHub guardrails for agent worktrees and shell tool calls (issue #80). */

import fs from 'node:fs/promises';
import path from 'node:path';
import { git } from './exec.ts';

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
  return null;
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

/** Installs a worktree-local pre-push hook (does not touch the floor's main checkout). */
export const PRE_PUSH_HOOK_BODY = (defaultBranch: string) => `#!/bin/sh
# cubefarm agent safety: block default-branch and force pushes
set -eu
default=${JSON.stringify(defaultBranch)}
zero="0000000000000000000000000000000000000000"
while read -r local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$zero" ] && continue
  case "$remote_ref" in
    refs/heads/*)
      branch="\${remote_ref#refs/heads/}"
      if [ "$branch" = "$default" ]; then
        echo "cubefarm: agents cannot push to the default branch ($default)." >&2
        exit 1
      fi
      ;;
  esac
done
i=0
while [ "$i" -lt "\${GIT_PUSH_OPTION_COUNT:-0}" ]; do
  eval "opt=\\$GIT_PUSH_OPTION_$i"
  case "$opt" in
    force|force-if-includes|force-with-lease)
      echo "cubefarm: force-push is not allowed for agents." >&2
      exit 1
      ;;
  esac
  i=$((i + 1))
done
exit 0
`;

export async function installAgentGitHooks(worktree: string, defaultBranch: string): Promise<void> {
  const hooksDir = path.join(worktree, '.cubefarm', 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, 'pre-push');
  await fs.writeFile(hookPath, PRE_PUSH_HOOK_BODY(defaultBranch), { mode: 0o755 });
  await git(['config', 'core.hooksPath', '.cubefarm/hooks'], { cwd: worktree });
}
