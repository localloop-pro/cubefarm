# Local safety

cubefarm is a single-user tool for the manager's own machine. It runs coding agents that can push branches, open
pull requests and run commands with the manager's credentials, so the office's HTTP and websocket surface is
powerful. This page says what the office defends against, what it does not, and how to run it safely.

## Threat model

The request checks defend the office against attackers who can reach it **through the manager's browser or
network name resolution**, not against code already running on the machine.

In scope:

- **A hostile web page in the same browser.** Any site the manager visits can make the browser send requests to
  `http://127.0.0.1:<port>`. Without checks it could start agents, change settings or merge PRs.
- **CSRF.** Cross-site form posts, `fetch` with `no-cors`, and image/script loads aimed at office routes. Unsafe
  methods (anything but `GET`/`HEAD`) need an exact allowed `Origin`; a `Sec-Fetch-Site: cross-site` request is
  always refused.
- **DNS rebinding.** A hostile domain that re-resolves to `127.0.0.1` so the browser treats it as same-origin.
  Defeated by requiring an exact loopback `Host` header (below): the rebinding name never matches.
- **A hostile PR author.** Issues, PR titles, bodies, comments and code are untrusted input to agents and to the
  office. They must never widen what an agent may do, and merges happen only at the exact commit QA tested.

Out of scope:

- **Local processes.** Any program running as the manager (or as root) can read `SWARM_HOME`, read the agents'
  hook tokens, talk to the pty host, or send requests with forged headers. The office does not try to stop this;
  protect the machine and the user account instead.
- **Authentication.** The office has no login or user accounts. Loopback binding plus the Host/Origin checks are
  the boundary; they are not a substitute for authentication and do not make it safe to share the office.

Checks fail closed: a missing, malformed, duplicated or unrecognized header is a refusal (`403`), never a pass.

## Loopback only

The server, its websockets (`/ws`, `/ws/term`), the pty host's hook relay and the previews listen on `127.0.0.1`
only. They must never bind `0.0.0.0` or a LAN address.

Allowed `Host` (and, for browser requests, `Origin` as `http://<host>`) forms are exactly:

- `127.0.0.1:<PORT>`
- `localhost:<PORT>`
- `[::1]:<PORT>`

where `<PORT>` is the port the server is actually bound to. In development the Vite port (`SWARM_CLIENT_PORT`) is
also allowed, with the same three host names. Everything else is refused, including `0.0.0.0`, `127.1`, numeric,
hex or octal spellings, a trailing dot (`localhost.`), suffixes (`localhost.example.com`), userinfo, paths or
queries in the header, and a wrong or missing port.

- Safe `GET`/`HEAD` requests may omit `Origin` only when Fetch Metadata is absent, `none` or `same-origin`.
- Unsafe methods from a browser need an exact allowed `Origin`.
- The only originless unsafe exceptions are the agents' callbacks, `POST /api/hooks/:token` and
  `POST /api/mcp/:token`. The token is checked before the body is parsed; look-alike paths are refused.

### Never expose the office

**Never put the office behind a public tunnel (ngrok, Cloudflare Tunnel, Tailscale Funnel, SSH reverse forwards
and the like), a reverse proxy, port forwarding, or a LAN/Wi-Fi address.** Anyone who reaches it can drive agents
that hold the manager's GitHub and coding-agent credentials. A proxy that rewrites `Host` to a loopback form would
also silently defeat the DNS-rebinding check. If you need the office elsewhere, run it on that machine.

## Least privilege for agents

Agents are ordinary CLI sessions with the manager's own setup and are not sandboxed; the office's workflow rules
live in their prompts. Keep what they can reach small:

- Give the GitHub account or token used by `gh` access only to the repositories the office works on, and protect
  the default branch (required reviews/checks, no force-push) so a prompt mistake cannot land on `main`.
- Keep secrets out of the repositories and out of agents' working folders; `ANTHROPIC_*` and `CLAUDE_*` are
  already stripped from agent and preview environments.
- Treat issue and PR text as untrusted. Don't ask agents to run scripts from it.
- Don't run the office as an administrator/root account, and keep `SWARM_HOME` private to your user.

## Pausing the scheduler

`schedulerPaused` (a persisted office state boolean, default `false`) stops the office from **starting** new work.
The manager toggles it in the manager's console. Starting with `SWARM_START_PAUSED=1` forces it to `true` for
that run; the variable can only pause, never clear a stored pause.

While paused, nothing autonomous begins: no queued build, QA or fix sessions, no CEO jobs from the queue, no
recovery, retries or nudges, and no automatic merges. The pause is rechecked right before each launch or merge, so
work that was mid-preparation when you paused is held, not started. An idle CEO does not start from a queued
message; the manager can still message a CEO that is already running.

What keeps running: sessions already in progress finish normally, and housekeeping (state saves, websocket
updates, terminal mirrors, polling for status) continues. Unpausing resumes scheduling once.

## Session cap

`settings.sessionLimit` is the hard cap on agent sessions preparing or running at once. `0` means unlimited.
When it is positive, one slot is reserved for the CEO while the CEO is idle, so workers can use at most
`sessionLimit - 1` slots and the CEO can always start. A slot is taken before a session is prepared and released
when it finishes, fails, is aborted or is held by a pause. Automatic merges use no slot but still obey the pause.
