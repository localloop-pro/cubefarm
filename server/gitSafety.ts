// Git safety rules for agents: no pushes to the default branch, no force-pushes, no merging pull requests.
// Two layers: a pre-push hook installed in each desk (covers every CLI) and a check on shell commands that Claude's
// tool hooks run before the call (covers `gh pr merge`, which no git hook sees).
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
export async function installPushGuard(desk: string, defaultBranch: string): Promise<void> {
  const gitDir = path.resolve(desk, (await git(['rev-parse', '--git-dir'], { cwd: desk })).trim());
  const hooks = path.join(gitDir, 'cubefarm-hooks');
  await fs.mkdir(hooks, { recursive: true });
  await fs.writeFile(path.join(hooks, 'pre-push'), prePushHook(defaultBranch), { mode: 0o755 });
  await git(['config', 'extensions.worktreeConfig', 'true'], { cwd: desk });
  await git(['config', '--worktree', 'core.hooksPath', hooks], { cwd: desk });
}
