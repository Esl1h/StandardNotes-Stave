# 11. Ship every asset with the build

Date: 2026-10-26

## Status

Accepted. Its Verovio renderer is dropped by [record 16](0016-no-verovio-renderer-for-abc.md).

## Context

Standard Notes works offline, and the plugin should keep working after its first load without reaching any host but its own. alphaTab needs its font, its SoundFont and its worker and worklet scripts; abcjs's synth fetches instrument samples from a CDN by default; Verovio is a WebAssembly module.

## Decision

Fonts, SoundFonts, workers and WebAssembly are copied into the build and referenced with paths relative to the page, never from a CDN. The Content Security Policy (record 5) stays as strict as these allow: workers from the plugin's own origin, and `'wasm-unsafe-eval'` only once Verovio is added. How ABC is played offline is decided when the ABC engine lands.

## Consequences

Large assets load lazily (the SoundFont on the first Play, Verovio when its renderer is chosen) so they do not weigh on opening a note. Their size is reported with the bundle at every milestone.
