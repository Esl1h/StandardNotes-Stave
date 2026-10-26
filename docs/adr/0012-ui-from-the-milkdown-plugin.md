# 12. Build the UI on the patterns of the Milkdown plugin

Date: 2026-10-26

## Status

Accepted

## Context

The Milkdown plugin already solved a collapsible bar, split and stacked layouts, preferences kept in the component data, a CodeMirror source pane themed with the Standard Notes variables, and a stale-echo guard for saves.

## Decision

The UI reuses those patterns and code: layout preferences in the component data with a localStorage fallback, a CodeMirror 6 source pane, panes that stack on narrow screens, and colors only from `--sn-stylekit-*` variables, read at runtime with `getComputedStyle` where a renderer needs plain colors. UI icons come from Lucide (ISC), whose stroke style matches the Milkdown icons. Musical symbols on the toolbar (durations, accidentals, bar lines) are small SVG drawings in `src/components/MusicIcon.tsx`, not glyphs of the Bravura font: Bravura is 313 KB as woff2 and its license reserves the name, so a subset would need renaming, while the toolbar is part of the initial load. React stays on 18, like the other plugins, because the Standard Notes style kit requires it.

## Consequences

Every theme works without per-theme code. Lucide icons are imported one by one, so only the icons in use are bundled.
