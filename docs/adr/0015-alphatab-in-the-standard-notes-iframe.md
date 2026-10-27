# 15. Run alphaTab in the Standard Notes iframe

Date: 2026-10-26

## Status

Accepted

## Context

alphaTab renders on the main thread or in a worker, and plays through a worker (the synthesizer) and an audio worklet (the output). Its Vite plugin bundles both as module scripts that the worker loads from the plugin's URL. Standard Notes loads the plugin in an iframe without `allow-same-origin`, so the page has an opaque origin, and measured in Chromium:

- a worker cannot start from the plugin's URL (a SecurityError: the script is not same origin with `null`)
- a worker started from a blob has an opaque origin too, so it cannot import the plugin's URL either, and a module worker from a blob fails to start at all
- a classic worker from a blob that holds the whole script runs, and the page itself can fetch scripts, fonts and the SoundFont from the plugin's origin and add the audio worklet

alphaTab also links no beat of its score to the alphaTex text it came from, and its font and SoundFont folders hold 3.6 MB of formats no supported browser asks for.

## Decision

- The renderer draws SVG on the main thread (`useWorkers: false`); small scores render faster than through a second copy of alphaTab in a worker
- alphaTab's Vite plugin is not used. One entry, `src/engines/alphatex/player-thread.ts`, imports alphaTab; Vite builds it as one minified classic script with no imports, which serves as both the worker and the worklet, since alphaTab sets itself up for whichever it runs in
- The page fetches that script on the first Play and starts the worker from a blob of its text, through `Environment.initializeMain`; the worklet is added from the plugin's URL. The Content Security Policy gains `worker-src blob:`; only code already running in the page can make such a blob
- The SoundFont loads on the first Play too: the player stays disabled until then, so opening a note downloads neither the player script nor the SoundFont
- Only `Bravura.woff2` and `sonivox.sf3` are copied into the build, each with its license
- The page parses alphaTex with alphaTab's importer, which gives the diagnostics with their position; the importer's private beat step is wrapped to note the source range of each beat, for clicks and highlights. A unit test checks the ranges on every alphaTab update

## Consequences

Playback works in the opaque origin of the app as in a normal page, and e2e tests run it in both. The player script, 267 KB gzip, is a second copy of alphaTab next to the renderer's 282 KB; together with the SoundFont (295 KB) they are fetched once, on the first Play. If alphaTab renames its beat step, clicks and highlights stop finding ranges until the wrapper follows, and the unit test says so.
