# Security Policy

## Supported versions

Only the [latest release](https://github.com/Esl1h/StandardNotes-Stave/releases/latest)
receives security fixes.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting (Security tab > Report a
vulnerability) instead of opening a public issue. Please include the
affected version and, if possible, the note content that triggers the
problem.

## Responding to reports

- The maintainer acknowledges a report within 7 days.
- A fix, or a written explanation of why the report is not a vulnerability or will not be fixed, follows within 60 days. Reporters are kept informed in the private report.
- A fix ships as a new release, built and published by the release workflow like any other (see [Releases](README.md#releases)); the hosted build updates with it and the Standard Notes app picks it up from `ext.json`. The release notes name the fixed problem once the fix is out.
- Reporters are credited in the release notes, unless they ask to stay anonymous.
- In the last 12 months no vulnerability reported by an outside party is recorded in the [CHANGELOG](CHANGELOG.md) or in this repository, so none was resolved with a credit owed. The private reports and advisories on GitHub are not part of the files and were not checked for this page.
- Two security-relevant fixes appear in the CHANGELOG, both with no outside report recorded in the files: abcjs warning text is read with an inert parser (1.0.1), and the relay ignores messages from windows other than the host (1.3.0). A CodeQL alert about `postMessage` with target origin `*` was found internally, reviewed and dismissed as "won't fix" in 2026-11, after the `event.source` check was added: the relay falls back to `*` only when the host's origin is the string `"null"`, as in the mobile app (see [record 7](docs/adr/0007-no-git-dependencies.md)), and the receiving window is always the parent window, which the relay already checks on the way in.

## Security requirements

What you can expect:

- The editor makes no network request of its own. Renderers, music fonts, SoundFonts and samples ship with the build and are loaded from the plugin's own origin; nothing comes from a CDN, and there is no telemetry or analytics.
- The note is stored only by Standard Notes, encrypted with the rest of your data. The plugin saves the note text and its preview through the Standard Notes relay, and its layout preferences in the plugin's component data, not in the note.
- A Content Security Policy, set at build time in `vite.config.ts`, allows scripts and connections only from the plugin's own origin, workers only from blobs the page makes, and no plugins, base URL or form targets.
- Note text and imported score files are treated as untrusted: they are drawn as text, never run, and an import is limited to 5 MB.
- Releases can be checked against their build provenance (see [Verifying a release](README.md#verifying-a-release)).

What you cannot expect:

- Protection from a malicious host: the plugin trusts the Standard Notes app that loads it, and any plugin installed from a URL has the access Standard Notes gives plugins. Install only from a source you trust.
- Protection from a malicious dependency beyond the checks below: the bundled libraries (abcjs, alphaTab, CodeMirror, React) are third-party code.
- A bounded cost for a hostile score file: the 5 MB limit applies to the size of the file, not to what it expands to or to the time alphaTab needs to read it. A crafted file can make the plugin's own tab slow or unresponsive; it cannot reach other tabs or other notes.
- Confidentiality of exported files: SVG, PNG, MIDI, Guitar Pro and PDF files are written unencrypted to where you save them.

Out of scope: vulnerabilities in Standard Notes itself (see [Scope](#scope)), in the hosting of GitHub Pages, and attacks that need control of your device or browser.

## Supply chain

- Every change reaches `main` through a pull request with signed commits and passing CI; force pushes and deletions are blocked, and release tags cannot be moved or deleted
- Workflow actions are pinned to commit hashes and run with read-only tokens unless a job needs more
- Releases are immutable and carry `SHA256SUMS` and a build provenance attestation; the README explains how to verify them
- The [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/Esl1h/StandardNotes-Stave) checks these practices weekly. Its Code-Review and Branch-Protection checks stay low by design: this is a single-maintainer project, so pull requests are not reviewed by a second person

## Dependency monitoring

- [Dependabot](.github/dependabot.yml) opens a pull request for outdated or vulnerable npm packages every week, and for GitHub Actions every month. Each goes through the same CI as any change before it is merged.
- CI runs `npm audit --audit-level=critical` on every push and pull request (`.github/workflows/ci.yml`). The step is advisory, so a finding does not fail the build; it shows in the log, and the maintainer decides.
- On a finding, the maintainer updates the package, or checks whether the vulnerable code path is reachable from this plugin (the build is client side and has no server), and records the reason in the pull request or the issue. Fixes ship as a release, as above.
- `npm ci` and `scripts/check-lockfile.mjs` make sure only registry packages from `package-lock.json` are installed ([record 7](docs/adr/0007-no-git-dependencies.md)). The one copied dependency, the Standard Notes relay, is in `src/vendor/component-relay/` and documented there.

## Scope

- The editor runs entirely client side; notes live inside your Standard
  Notes account, encrypted with the rest of your data
- Nothing is transmitted anywhere except through Standard Notes itself;
  the editor has no network access of its own
- Every asset the editor needs (renderers, music fonts, the SoundFont) ships with the build; nothing is fetched from a CDN at runtime
- Imported files are read in the browser only
- The hosted build is static content served from GitHub Pages
- Vulnerabilities in Standard Notes itself belong to
  [Standard Notes security](https://standardnotes.com/help/2/has-standard-notes-completed-a-third-party-security-audit)

## Assurance case

This section argues that the security requirements above are met. Each claim points to code, tests or configuration in this repository. Gaps are stated as gaps.

### Threat model

Assets:

- The user's note text, which the plugin can read and rewrite through the relay.
- The integrity of what the plugin saves back to the note.
- The user's session in the Standard Notes app, which the plugin runs inside.
- The integrity of the build that users install.

Attackers considered:

- Someone who gives the user a note, a shared snippet or a score file (`.musicxml`, `.mxl`, Guitar Pro, Capella) to open: hostile text or files.
- A web page or window that tries to send messages to the plugin's iframe, to pose as the host.
- A compromised or malicious dependency, or a tampered release.

Entry points:

- Note text, drawn by the engines (`src/engines/*/renderer.ts`, `src/engines/chordpro/syntax.ts`).
- Imported score files (`src/components/Workspace.tsx`, `src/engines/alphatex/import.ts`).
- `postMessage` events from the relay (`src/vendor/component-relay/ComponentRelay.ts`).
- Fetches of the plugin's own assets (the alphaTab player script, SoundFonts, samples).
- Dependencies and the release pipeline.

Not considered: a hostile Standard Notes host, a compromised browser, or physical access.

### Trust boundaries

- The Standard Notes app and the plugin iframe: crossed only by `postMessage` through the relay. Messages are accepted only from the parent window.
- Note text and files to the page: untrusted data becomes drawings and text, never markup or script.
- The plugin's origin and everything else: the CSP limits scripts and connections to the plugin's own origin.
- The main page and the alphaTab worker: the worker runs from a Blob URL of the plugin's own script.
- Source and release: the release workflow builds from a tagged commit and signs its provenance.

### Secure design principles

- **Least privilege.** The plugin has no network access beyond its origin (`connect-src 'self'`, `default-src 'self'`) and no plugins, base URL or form targets (`vite.config.ts`). The workflows get a read-only token unless a job needs more (`permissions` in `.github/workflows/*.yml`). It asks the host only for the context note and its own component data.
- **Fail-safe defaults.** The CSP denies everything not named. A locked note opens read-only and `onEditorValueChanged` refuses to save it (`src/core/noteBridge.ts`). A message whose source is another window is dropped before it is read.
- **Complete mediation.** Every message from the host passes the one handler in `registerMessageHandler`, where the source is checked. Every import goes through `importFile` in `src/components/Workspace.tsx`, which applies the size limit before reading the file. Every export and print goes through the `Engine` interface.
- **Economy of mechanism.** A small interface (`src/core/engine.ts`), no backend, no accounts, no runtime configuration, and a small vendored relay with two documented local changes (`src/vendor/component-relay/README.md`).
- **Open design.** The source is public under the AGPL, the design is in `ARCHITECTURE.md` and the decisions in `docs/adr/`, and security does not depend on secrecy.
- **Supply chain.** Releases are immutable with signed provenance, actions are pinned to commit hashes, and no dependency comes from git (`scripts/check-lockfile.mjs`, run in CI before `npm ci`).

Where principles conflict: the CSP leaves styles, images and fonts open (`style-src *`, `img-src *`, `font-src *`) because the host injects its themes from places that differ between apps ([record 5](docs/adr/0005-content-security-policy.md)). This is economy over least privilege. It is a known gap: the CSP does not stop a request made by an image or style, and the defense for that case is that no note content becomes markup.

### Common weaknesses

- **Cross-site scripting (CWE-79).** ABC warnings from abcjs hold HTML; `parseWarnings` in `src/engines/abc/renderer.ts` reads them with `DOMParser` and keeps only `textContent`, and `src/engines/abc/renderer.test.ts` checks a warning with `<img onerror>` and a title with markup. The ChordPro sheet is built with `textContent` for every text from the note (`src/engines/chordpro/renderer.ts`, with its tests). The CSP forbids inline scripts and `eval` (`script-src 'self'`), and `e2e/csp.spec.js` fails on any violation while drawing and playing, in the web host and the opaque-origin mobile host. alphaTab and abcjs draw SVG from the note; their output is not reinserted as HTML by Stave beyond what they build themselves, and a gap remains if either library had an XSS of its own, which is why they are watched through Dependabot.
- **Spoofed messages (CWE-346).** The `event.source` check in `src/vendor/component-relay/ComponentRelay.ts`, with `ComponentRelay.test.ts` covering a message from the parent and from another window. A null source is accepted for the native mobile app, which dispatches from the WebView itself.
- **Zip or file bombs, resource exhaustion on import (CWE-400, CWE-409).** Imports are read in the page, with a limit of 5 MB on the file (`MAX_IMPORT_BYTES`, `src/components/Workspace.tsx`). Known gap: that limit is on the compressed size; a `.mxl` file is a zip and alphaTab expands it without a limit set by Stave, and nothing bounds the time to parse. The limit has no unit test. The harm is confined to the plugin's own iframe. The "large score warning" idea was deferred on purpose (see the roadmap in the README).
- **Worker from a Blob URL.** The blob holds the text of the plugin's own player script, fetched from its own origin, and `worker-src blob:` is the only worker source the CSP allows. The Blob URL is revoked as soon as the worker is made (`src/engines/alphatex/renderer.ts`). The risk is that code already running in the page could make its own blob; such code is already running with the page's rights.
- **Canvas and memory limits on PNG export.** `pngScale` in `src/core/download.ts` caps the canvas at 16384 px a side and 100 million pixels, tested in `src/core/download.test.ts`. Echo guard memory is bounded by time and by 500 entries (`src/core/echoGuard.ts`).
- **Path or name injection in downloads.** `src/core/download.ts` strips path and reserved characters from the file name and caps its length, tested in `download.test.ts`.
- **Vulnerable or malicious dependencies, supply chain (CWE-1357).** Dependabot, `npm audit` in CI, `npm ci` from a lockfile with registry packages only, pinned actions, immutable signed releases and the Scorecard (see [Supply chain](#supply-chain) and [Dependency monitoring](#dependency-monitoring)). `THIRD_PARTY_LICENSES.md`, generated at build, lists what is bundled. Gap: the vendored relay is not seen by Dependabot and an upstream fix has to be copied by hand ([record 7](docs/adr/0007-no-git-dependencies.md)).
- **Memory safety.** The project is TypeScript (`strict` in `tsconfig.json`) in the browser's sandbox; it has no native code.
- **Static analysis.** ESLint with typescript-eslint (`eslint.config.mjs`) on every change in CI, and CodeQL code scanning on the repository (its badge is in the README).
