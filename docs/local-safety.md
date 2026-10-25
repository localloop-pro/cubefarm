# Local safety

cubefarm is a single-user tool for your own machine. The office server can start coding agents, push branches,
merge pull requests and type into terminals, so anything that can talk to it can act as you. This page says what the
office defends against, what it does not, and how the scheduler pause and the session cap behave.

## Threat model

The request checks defend against:

- **A hostile web page in the same browser.** Any site you visit can send requests to `localhost`. Without checks,
  it could post to `/api`, open `/ws` or `/ws/term`, start work or type into an agent's terminal.
- **CSRF.** Form posts, `fetch` with `no-cors` and similar cross-site writes that ride on the browser's access to
  `localhost`.
- **DNS rebinding.** An attacker's hostname resolving to `127.0.0.1` so that their page looks same-origin with the
  office. Exact `Host` checking defeats it: the request still carries the attacker's hostname.
- **A hostile PR author.** Issue and PR text, branch contents and review comments are untrusted input. They reach
  agents' prompts and working trees, never the office's request boundary as trusted callers. Merges only happen on
  the exact head SHA that QA passed, with passing checks (see the merge gate).

They do **not** defend against, and are not meant to:

- **Local processes.** Any program running as you (or as another user on the machine) can reach a loopback port,
  send any headers and read your `SWARM_HOME`. The office is not a security boundary against software on the same
  machine; agents themselves run unsandboxed as you.
- **Authentication.** There are no accounts, passwords or sessions. Being able to reach the port and pass the
  `Host`/`Origin` checks is the whole of access control.

Security fails closed: a request the policy cannot classify is rejected with `403`.

## Loopback only

The server binds to loopback. A request is accepted only when its `Host` header is exactly one of:

- `127.0.0.1:<PORT>`
- `localhost:<PORT>`
- `[::1]:<PORT>`

where `<PORT>` is the bound `SWARM_PORT`. In development (Vite) the same three hosts are additionally allowed with
the exact `SWARM_CLIENT_PORT`. Everything else is rejected, including `0.0.0.0`, shortened or numeric forms such as
`127.1`, `2130706433` or octal `0177.0.0.1`, a trailing dot (`localhost.`), suffixes (`localhost.evil.test`),
userinfo, paths or queries in the header, a wrong or missing port, and duplicate or malformed headers.

Browser checks on top of `Host`:

- `Sec-Fetch-Site: cross-site` is always rejected.
- Safe `GET`/`HEAD` requests may omit `Origin` only when Fetch Metadata is absent, `none` or `same-origin`.
- Unsafe methods from a browser (`POST`, `PUT`, `PATCH`, `DELETE`) need an `Origin` that is exactly
  `http://` plus one of the allowed hosts above.
- The `/ws` and `/ws/term` upgrades get the same `Host`/`Origin`/Fetch Metadata checks.
- The only unsafe requests allowed without an `Origin` are `POST /api/hooks/:token` and `POST /api/mcp/:token`,
  which the agents' own CLIs call. The token is checked against a live session before the body is parsed; unknown
  tokens and look-alike paths are rejected.

## Never expose the office

Do **not** put the office on a LAN address, `0.0.0.0`, a reverse proxy, a port forward, or a public tunnel
(ngrok, Cloudflare Tunnel, Tailscale Funnel, VS Code port forwarding, `ssh -R`, and the like). There is no
authentication: anyone who can reach it can run agents, merge code and type into terminals with your GitHub and
model credentials. The `Host` allow-list will reject most forwarded traffic, but that is a guard against mistakes,
not a supported way to share the office. To use it from another device, sit at the machine or use a remote desktop
to that machine.

## Least privilege for agents

Agents are ordinary CLI sessions with your user's rights, by the manager's choice; the workflow rules (no pushes to
the default branch, no merging, QA leaves GitHub alone) live in their prompts, not in enforcement. Keep the blast
radius small:

- Run the office under an OS account and a `gh` login that can reach only the repositories it works on; prefer a
  fine-grained token scoped to those repositories over a broad classic token.
- Protect the default branch on GitHub (required reviews/checks) so a misbehaving agent cannot push to it.
- Keep secrets that agents do not need out of the environment and out of the worktrees. `ANTHROPIC_*` and
  `CLAUDE_*` are already stripped from agent and preview environments.
- Each agent works in its own worktree under `SWARM_HOME`; do not point projects at folders holding unrelated data.

## Scheduler pause

`schedulerPaused` (persisted in the office state, default `false`) stops the office from starting new autonomous
work. The manager toggles it from the manager's console. Starting the server with `SWARM_START_PAUSED=1` forces it
to `true` at startup; the variable never clears a stored `true`, so only the manager resumes.

While paused, the office does not:

- start queued build, QA or fix sessions, or a queued CEO job;
- recover, retry or nudge sessions;
- auto-merge.

The pause is rechecked after any asynchronous preparation and immediately before a launch or an automatic merge, so
work prepared before the pause does not slip through. An idle CEO does not start from a queued message; the manager
may still message a CEO that is already running.

What keeps running: sessions that were already running when the pause began, and housekeeping (usage, progress,
update-drain and save ticks).

## Session cap

`settings.sessionLimit` is a hard cap on concurrent agent sessions, counting sessions being prepared as well as
running ones.

- `0` means unlimited.
- When positive, one slot is reserved for the CEO while the CEO is idle, so workers alone can use at most
  `sessionLimit - 1` slots and the CEO can always start. Once the CEO is busy its own session uses that slot.
- A slot is reserved atomically before preparation, rechecked before launch, and released when the session
  finishes, fails, is aborted or is held by the pause.
- Auto-merge uses no session slot, but it obeys the scheduler pause.
