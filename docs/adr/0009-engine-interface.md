# 9. One engine interface, one chunk per engine

Date: 2026-10-26

## Status

Accepted. Its Verovio renderer is dropped by [record 16](0016-no-verovio-renderer-for-abc.md).

## Context

The editor supports several text notations whose syntax, renderer and player differ. The menu, the toolbar and the panes should not need changes when a notation is added, and a user who writes only ABC should not download alphaTab.

## Decision

The UI talks to notations only through the `Engine` and `EngineInstance` interfaces in `src/core/engine.ts`. An engine detects its own text, provides a template, a title for the notes list and a cheat sheet, turns toolbar commands (`Cmd`) into an edit of the source (a replacement of a range, so a command can act on the selected note as well as insert), and mounts a renderer that reports errors with line and column and may offer a player, export and transposition. Transposition returns the rewritten source: the note text is the source of truth, so it is not only the drawing that moves. Each engine's renderer is loaded with a dynamic `import()`, so it becomes its own chunk; a renderer that is only needed on demand (Verovio) is a further dynamic import inside its engine.

## Consequences

Engine specific features reach the toolbar through `tools()` and `technique` commands instead of new UI code. The registry in `src/engines/registry.ts` is the only file that lists the engines.
