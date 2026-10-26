# 10. Detect the engine from the note text

Date: 2026-10-26

## Status

Accepted

## Context

The note text is the source of truth and must stay readable without the plugin, so the chosen notation cannot be stored as UI state inside the note. Converting between notations (ABC to alphaTex) loses information.

## Decision

The engine of a note is detected from its text: ABC when the first non-empty line starts with `X:`, alphaTex when lines start with a backslash metadata tag, ChordPro when it has `{title:`, `{t:` or inline `[Chord]`s. An empty note offers the engines with their templates. The last engine chosen becomes the default for new notes, kept in the component data. Switching engines on a note with content asks for confirmation and does not convert the text.

## Consequences

A note that matches no rule opens in the default engine. Conversion between notations is out of scope until a lossless path exists (for example through MusicXML).
