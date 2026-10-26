# 13. A bundle budget, reported at every milestone

Date: 2026-10-26

## Status

Accepted

## Context

The plugin opens inside a notes app, on phones too, so its first load should stay small even though the renderers are large.

## Decision

The initial load (React, the UI and CodeMirror, with no engine) aims at 250 KB gzip; the ABC engine at 200 KB gzip, loaded on demand; alphaTab, its SoundFont and Verovio load on demand with no fixed limit. `npm run size` reports the raw and gzip size of each file in `build/`, split into the initial load and lazy chunks, and its output goes into every milestone's pull request.

## Consequences

A budget that turns out to be out of reach is revisited in a new record with the measured numbers.
