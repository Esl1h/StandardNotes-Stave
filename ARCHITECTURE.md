# Architecture

Stave is a Standard Notes editor plugin: a static single-page app (React 18, CodeMirror 6, Vite) that the Standard Notes app loads in an iframe. It has no server. The note is plain notation text; Stave draws, plays and exports it, and never stores anything else in it. The reasons behind each choice are in the [architecture decision records](docs/adr/README.md); this page is the map.

## Components

- **Host relay** (`src/core/noteBridge.ts`, `src/vendor/component-relay/`): the Standard Notes relay, copied from upstream because the registry version breaks on mobile ([record 7](docs/adr/0007-no-git-dependencies.md)). The bridge streams the note in and saves it back, with saves coalesced for 350 ms. An echo guard (`src/core/echoGuard.ts`) drops a late echo of an earlier save so it does not overwrite newer typing. Layout preferences live in the component data, with a `localStorage` fallback (`src/core/preferences.ts`), never in the note.
- **Workspace** (`src/components/Workspace.tsx`, `SourcePane.tsx`, `RenderPane.tsx`, `MenuBar.tsx`, `Toolbar.tsx`): the source pane (CodeMirror) and the rendering pane side by side, stacked or one at a time, a menu bar and a contextual toolbar. It reaches notations only through the engine interface and holds no notation-specific code.
- **Engines** (`src/engines/`): one per notation, behind one interface.

## Engines

The UI talks to a notation only through `Engine` and `EngineInstance` in `src/core/engine.ts` ([record 9](docs/adr/0009-engine-interface.md)). An engine detects its own text, offers a template and a cheat sheet, turns toolbar commands into a source edit, and mounts a renderer that reports errors with line and column and may offer a player, exports, transposition and import. `src/engines/registry.ts` is the only file that lists them.

The engine of a note is detected from its text, not stored ([record 10](docs/adr/0010-engine-detection.md)): ABC when the first non-empty line starts with `X:`, alphaTex for backslash metadata tags, ChordPro for `{title:` or inline `[Chord]`s. Switching asks first and never converts the text.

- **ABC** (`src/engines/abc/`): [abcjs](https://www.abcjs.net) draws and plays it, on piano samples shipped in the build ([record 14](docs/adr/0014-abc-playback-samples.md)). Exports SVG, PNG and MIDI.
- **alphaTex** (`src/engines/alphatex/`): [alphaTab](https://www.alphatab.net) draws notation and tablature and plays it with a shipped SoundFont. Exports SVG, PNG, MIDI and Guitar Pro 7, and imports MusicXML, Guitar Pro 3 to 7 and Capella as alphaTex (`import.ts`).
- **ChordPro** (`src/engines/chordpro/`): Stave's own parser and HTML renderer, since the available library is GPL-2.0-only ([record 8](docs/adr/0008-notation-engines-and-libraries.md)). No playback. Exports SVG.

Verovio was measured and left out ([record 16](docs/adr/0016-no-verovio-renderer-for-abc.md)).

## Loading and offline assets

Each engine's renderer is a dynamic `import()`, so a note in ABC never downloads alphaTab, and the initial load stays small ([record 13](docs/adr/0013-bundle-budget.md)). Fonts, SoundFonts and workers ship in the build and are fetched with relative paths, never from a CDN ([record 11](docs/adr/0011-offline-assets.md)). The alphaTex player script and SoundFont are fetched on the first Play. `scripts/check-build.mjs` fails when `build/` holds a file nothing references.

alphaTab's player runs in a worker. The Standard Notes iframe has an opaque origin, where a worker cannot start from the plugin's URL, so the page fetches the player script and starts a classic worker from a Blob URL, revoked once the worker is created ([record 15](docs/adr/0015-alphatab-in-the-standard-notes-iframe.md), `src/engines/alphatex/renderer.ts`).

## Export and print

Engines return a `Blob` for each export format; `src/core/download.ts` saves it and turns SVG into PNG on a canvas, scaled to stay inside canvas limits. Print draws the engine's SVG export as an image in a print-only sheet and calls `window.print()` (the browser's print dialog also saves PDF).

## Build and release

`vite build` writes `build/` with the CSP meta tag added by `vite.config.ts` ([record 5](docs/adr/0005-content-security-policy.md)) and `THIRD_PARTY_LICENSES.md`. CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, unit tests, build, build contents check, the e2e suite and a Yarn 3 build like the community repository's. A version tag triggers `release.yml`, which requires green CI on the commit, rebuilds, packs `extension.zip`, attaches `SHA256SUMS` and a signed build provenance, and publishes the same build to GitHub Pages, from where the app reads `ext.json`.

## Trust boundaries

- **Standard Notes host to plugin**: the plugin runs in an iframe and talks to the host only by `postMessage`. The relay accepts a message only when `event.source` is the parent window; a null source stays allowed for the native mobile app (`src/vendor/component-relay/ComponentRelay.ts`, tested in `ComponentRelay.test.ts`). Messages to the host use the host's origin as target, falling back to `*` when the origin is `null`, as it is on mobile.
- **Note text and imported files** are untrusted input. Text from the note is put in the page through `textContent` or an inert `DOMParser`, never as markup; imported files are limited to 5 MB and parsed by alphaTab.
- **Static hosting**: the plugin is plain files on GitHub Pages and has no network access beyond its own origin, enforced by the CSP.
- **Worker from a Blob URL**: allowed by `worker-src blob:`; only code already running in the page can create the blob.

The security argument is in the assurance case in [SECURITY.md](SECURITY.md#assurance-case).

## Key properties

- The note stays plain text, readable without the plugin.
- Nothing is fetched at runtime from another host; no telemetry.
- Adding a notation touches the engine registry, not the UI.
- Every dependency comes from the npm registry, so the lockfile is the full record.
