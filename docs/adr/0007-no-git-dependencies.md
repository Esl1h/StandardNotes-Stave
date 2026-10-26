# 7. No git dependencies

Date: 2026-10-26

## Status

Accepted

## Context

The other plugins depend on `@standardnotes/editor-kit` and `@standardnotes/component-relay` from git commits (record 2). A git dependency needs access to codeload at install time, sits outside the registry's integrity and audit data, and the community repository installs with Yarn 3, where git dependencies are a frequent source of failures. On the npm registry, `@standardnotes/component-relay` 2.2.2 is published with an AGPL-3.0 license file and no dependencies; `@standardnotes/editor-kit` 2.3.1 is published too, but itself depends on the relay through a git URL.

## Decision

This plugin installs every dependency from the npm registry and does not use editor-kit. `scripts/check-lockfile.mjs` fails on any git, `github:` or codeload reference in `package-lock.json`, and runs in CI before `npm ci`.

The registry's relay 2.2.2 posts to the host with the host's origin as the target, which is the string `"null"` in the mobile app and throws, so the note is never requested; 2.3.2 falls back to `"*"`, and 2.3.2 is not on the registry. The TypeScript sources of 2.3.2, from the commit the other plugins pin, are copied into `src/vendor/component-relay/` with their license, built with the rest of the plugin, and reached through a small note bridge (as in the Kanban plugin). The two changes made to them, replacing type-only imports from snjs with local stand-ins, are listed in the README next to them.

## Consequences

The bridge carries its own tests, and the vendored relay is tested through it. A relay fix upstream has to be copied by hand; Dependabot does not see it. The vendored code is excluded from linting and formatting so it stays comparable with upstream.
