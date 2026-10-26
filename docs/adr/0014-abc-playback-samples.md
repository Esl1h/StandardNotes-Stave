# 14. Play ABC with piano samples shipped in the build

Date: 2026-10-26

## Status

Accepted

## Context

Record 11 left open how ABC is played offline. The abcjs synth plays MP3 samples, one per instrument and key, fetched from a CDN (`paulrosen.github.io/midi-js-soundfonts`) by default. Two ways to keep it offline were weighed:

- Ship a set of those samples and point the synth at them. The Fluid R3 GM acoustic grand piano is 89 MP3 files, 2.0 MB in all, under the Creative Commons Attribution 3.0 license; the synth fetches only the keys a tune plays. No npm package carries these files
- Play ABC through alphaTab's synthesizer with its Sonivox SoundFont (Apache-2.0, 977 KB as sf3), one sound bank for both engines. abcjs exports MIDI, but alphaTab has no MIDI importer and its synthesizer plays its own score model, so this would need a MIDI to alphaTab converter

## Decision

The Fluid R3 GM acoustic grand piano samples are copied into `public/soundfont/`, each file checked against the git hash in the midi-js-soundfonts repository, with the license and credits next to them. The player points abcjs at that folder, turns the drum track off and plays every track on the piano, so a tune that asks for another instrument still plays offline. `scripts/check-build.mjs` accepts files under `soundfont/`, which the player reaches by a name it builds at runtime.

## Consequences

ABC plays offline, on piano only; other General MIDI instruments would need their own samples. The 2 MB of samples count as lazy assets in the bundle report and are fetched note by note on the first play. If alphaTab later gains a way to play MIDI, a single SoundFont for both engines can replace them in a new record.
