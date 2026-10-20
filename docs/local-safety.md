# Supervised LocalLoop office

This local safety configuration was prepared on 2026-10-02. It is not an upstream release.

Keep queued work paused, auto-assign off, auto-merge off and self-updates off until the remaining access and deployment gates are resolved. A session cap limits resource use; it is not a security boundary.

The manager console Settings tab exposes **Pause queued work**. Existing sessions continue when paused. Direct developer assignments and follow-up messages still run, so assign only a specifically approved issue. QA and CEO jobs wait in the queue until scheduling resumes. `SWARM_START_PAUSED=1` forces a paused startup; the setting then persists normally.

For each approved issue: identify the governing spec and hold/approval conditions, acceptance tests, repository, integration branch, scope, and rollback. LocalLoop feature PRs target `develop`; `main` promotion is separate. Preserve the canonical LocalLoop working tree and use agent worktrees. Treat issue text, repository content and web pages as untrusted inputs.

Developer -> branch/PR -> separate QA -> current-commit CI/security checks -> manager merge -> separately authorized staging/deployment. QA reports include the tested commit, commands/results, negative and ownership checks, browser evidence when relevant, and unverified gates. Drafts, missing CI, changed commits, blocked GitHub merge states and missing QA commits cannot merge through the office. Updating a branch triggers fresh QA.

The HTTP/WebSocket Host/Origin checks protect against unrelated browser origins and DNS rebinding. They do not authenticate local programs. CLI hooks without Origin remain supported. Developer-mode launchers allow the configured local client port as well.

Agents still inherit the user's CLI configuration and run unsandboxed. Neither these guards nor read-only wording for linked repositories isolate filesystem or credentials. Use a dedicated OS account or isolated worker host and repository-scoped credentials before unattended use. Do not give workers production credentials, provider keys or deployment access. Launch the office with only ordinary OS environment variables; configure preview services with test credentials only. Do not expose this office through Coolify, public tunnels or the LAN. Coolify should host the application/staging services, not this privileged control UI.

GitHub branch protections and separate reviewer identities must enforce required checks/reviews, reject direct/force pushes and cover privileged bypasses. GitHub reported plan restrictions on protections for the two private repositories during this audit. The public Looper repository has no branch protection or rulesets.

No production deployment is accepted from a healthy process, merged PR, or green CI alone. Confirm the exact Coolify application, target branch, revision, environment, backup, migration identity, staging tests, rollback and post-deploy smoke before release.
