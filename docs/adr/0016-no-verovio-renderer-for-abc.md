# 16. No Verovio renderer for ABC, for now

Date: 2026-10-27

## Status

Accepted. Supersedes the Verovio parts of records 8, 9 and 11.

## Context

Record 8 planned Verovio as an optional, higher quality renderer for ABC, behind a View toggle and loaded only when chosen. Before building it, Verovio 6.3.0 (the current release, LGPL-3.0-or-later) was measured with the ABC example of this repository and a two-voice tune, in Node:

- Size: the toolkit with its WebAssembly is 7.3 MB raw, 2.34 MB gzip (3.7 MB gzip with Humdrum). abcjs, the whole ABC renderer and player, is 146 KB gzip.
- ABC support: its importer reports "Multi-voice music is not supported" and draws the voices one after another on the first staff. The example's bass voice came out after the melody, in treble clef, and voice names and `%%score` were lost. Tempo is "not fully supported".
- Single-voice tunes render well: lyrics are spaced better than with abcjs, and the engraving is closer to printed music. A render took 46 to 90 ms after 200 ms of start-up.
- Its SVG links elements to MEI ids, not to ABC character offsets, so clicks would not select the source, the cursor would not mark notes, and abcjs's player could not move a cursor on it.
- The Content Security Policy would need `'wasm-unsafe-eval'`.

## Decision

Stave does not ship Verovio. ABC keeps abcjs as its only renderer, and the View menu has no renderer toggle. Humdrum `**kern`, which would come with Verovio's larger build, is left out too.

## Consequences

The plugin stays 2.3 MB smaller, and its CSP keeps WebAssembly out. A note shows the same drawing for every ABC feature abcjs supports, with click to source and the playback cursor working. Engraving quality stays at abcjs's level. The question is open again when Verovio's ABC importer supports several voices; the measurements above can be repeated with `npm pack verovio` and its `verovio-module.mjs`.
