# Local safety

cubefarm is a single-user tool for the manager's own machine. Its server runs unsandboxed coding agents with the
manager's git, GitHub and model credentials. This page covers what it defends against, what it does not, and the
controls that limit how much work it starts. If a check is unsure, it refuses: the request boundary fails closed.

## Threat model

In scope (the request boundary mitigates these):

- **A hostile web page in the same browser.** Any site the manager visits can make the browser send requests to
  `http://localhost:<port>`. It must not be able to read office state, call office APIs or open the websockets.
- **CSRF.** Cross-site form posts, `fetch` calls and websocket upgrades that ride on the browser reaching loopback.
- **DNS rebinding.** An attacker's hostname that resolves to `127.0.0.1` sends requests whose `Host` header names the
  attacker's domain. Only exact loopback `Host` values are accepted, so these are rejected.
- **A hostile PR author.** Issues, PR titles, bodies, branches and code are untrusted input. They reach agents as
  text and code to work on, never as instructions to the office. Merging stays behind the merge gate (fresh QA pass
  on the exact head SHA, passing CI, clean merge state), and a paused scheduler merges nothing.

Out of scope (not mitigated here):

- **Local processes.** Anything already running as the manager's user (or as an administrator) can reach loopback,
  read `SWARM_HOME` and talk to the office. The request checks are not a defence against it.
- **Authentication.** The office has no login, users or passwords. Header checks are not authentication; they only
  stop browsers and rebinding from crossing the loopback boundary.
- Agents themselves: they run with the manager's privileges by the manager's choice (see Least privilege).

## Loopback-only

The server listens on loopback only. Every HTTP request and websocket upgrade (`/ws`, `/ws/term`) must carry a `Host`
that is exactly one of:

- `127.0.0.1:<PORT>`
- `localhost:<PORT>`
- `[::1]:<PORT>`

where `<PORT>` is the port the server is bound to (`SWARM_PORT`). In dev mode the exact Vite port
(`SWARM_CLIENT_PORT`) is also allowed with those three hosts. Everything else is rejected with `403`, including
`0.0.0.0`, `127.1`, other numeric, decimal, hex or octal spellings, a trailing dot (`localhost.`), a different port,
extra suffixes, userinfo, paths or queries, and duplicate or malformed headers.

Browser requests are then checked against the same allowed origins:

- `Sec-Fetch-Site: cross-site` is always rejected.
- Safe `GET`/`HEAD` requests may omit `Origin` only when Fetch Metadata is absent, `none` or `same-origin`.
- Unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) and websocket upgrades need an `Origin` that exactly matches an
  allowed `http://<host>:<port>` form above.
- The only unsafe requests allowed without `Origin` are the agent callbacks `POST /api/hooks/:token` and
  `POST /api/mcp/:token`, and only when the token belongs to a live session. The token is checked before the body is
  parsed; unknown tokens and look-alike paths are rejected.

## Never expose the office

Never expose the office beyond the machine: no public tunnel (ngrok, Cloudflare Tunnel, Tailscale Funnel, SSH remote
forwards and the like), no reverse proxy, no port forward, and no binding to `0.0.0.0` or a LAN address. There is no
authentication, and anyone who reaches the API can start agents that run commands with the manager's credentials.
A proxy that rewrites `Host` to loopback would also defeat the rebinding check. To use the office from elsewhere,
use a remote desktop to the machine itself.

## Least privilege

Agents are ordinary CLI sessions, unsandboxed. Limit what they can reach rather than relying on the office:

- Give the `gh` login and git credentials only the repositories the office works on, with no admin or org-owner
  rights. Protect the default branch on GitHub (required reviews and checks) so it cannot be pushed to directly.
- Keep unrelated secrets (cloud keys, SSH keys for other hosts, production `.env` files) off the machine or out of
  the agents' reach. `ANTHROPIC_*` / `CLAUDE_*` variables are stripped from agent and preview environments.
- Run the office as an ordinary user, never as administrator or root, and keep `SWARM_HOME` private to that user.
- Workflow rules (no pushes to the default branch, no self-merging, QA leaves GitHub alone) live in the agents'
  prompts. They guide agents; GitHub's branch protection is what enforces them.

## Pausing the scheduler

`schedulerPaused` (persisted, default `false`) stops the office from starting new work. While paused it holds:

- queued build, QA, fix and CEO jobs, automatic recovery, retries and nudges;
- auto-merge;
- an idle CEO: a queued message does not start it.

The pause is re-checked after any asynchronous preparation and immediately before a session launches or a merge
runs, so pausing mid-preparation still holds the work.

What keeps running: sessions that are already running finish normally (the manager may still message a running CEO),
and housekeeping continues (state saving, status refreshes, cleanup). Pausing does not kill anything; stop a session
explicitly if it must end now. Resuming releases held work once.

`SWARM_START_PAUSED=1` starts the office paused. It can only force the pause on: it never clears a stored pause, so a
paused office stays paused across restarts until the manager resumes it.

## Session cap

`settings.sessionLimit` is a hard cap on concurrent agent sessions (builds, QA, fixes and the CEO together).

- `0` means unlimited.
- A positive limit reserves one slot for the CEO while it is idle, so workers can use at most `sessionLimit - 1`
  slots and the CEO can always start. With `sessionLimit: 1` that one slot is the CEO's.
- Slots are reserved atomically before a session is prepared and released if preparation fails, is aborted or is
  held by a pause, so concurrent starts never go over the cap.
- Auto-merge uses no session slot, but it still obeys the pause.
