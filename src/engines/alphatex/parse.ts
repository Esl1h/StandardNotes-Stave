import * as alphaTab from '@coderline/alphatab';
import { type SourceError } from '../../core/engine';

/**
 * alphaTex read with alphaTab's importer, on the main thread: the score, the
 * diagnostics as source errors and the source range of every beat. Apart
 * from the renderer, which needs a browser, so it is unit tested.
 */

const SEVERITY_ERROR = 1;

/** alphaTex diagnostics (warnings and errors, not hints) as source errors. */
export function diagnostics(importer: alphaTab.importer.AlphaTexImporter): SourceError[] {
  return [
    ...importer.lexerDiagnostics.items,
    ...importer.parserDiagnostics.items,
    ...importer.semanticDiagnostics.items,
  ]
    .filter((diagnostic) => diagnostic.severity >= SEVERITY_ERROR)
    .map((diagnostic) => {
      const from = diagnostic.start?.offset;
      const to = diagnostic.end?.offset;
      return {
        message: diagnostic.message,
        line: diagnostic.start?.line ?? 1,
        column: diagnostic.start?.col ?? 1,
        from,
        // Some point at a place, not a range: mark the character there.
        to: from !== undefined && (to === undefined || to <= from) ? from + 1 : to,
      };
    });
}

export interface Parsed {
  score?: alphaTab.model.Score;
  errors: SourceError[];
  /** The source range each beat was read from. */
  ranges: Map<alphaTab.model.Beat, [number, number]>;
}

type BeatHook = (
  voice: alphaTab.model.Voice,
  node: { start?: { offset: number }; end?: { offset: number } }
) => void;

/**
 * Parses alphaTex, noting which source range each beat comes from. alphaTab
 * keeps no link from a beat to its text, so the importer's beat step is
 * wrapped: a private method, checked by a test on every alphaTab update.
 * Without it, clicks and highlights find no range; the rest still works.
 */
export function parse(src: string, settings: alphaTab.Settings): Parsed {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.logErrors = false;
  importer.initFromString(src, settings);
  const ranges = new Map<alphaTab.model.Beat, [number, number]>();
  const hooked = importer as unknown as { _beat?: BeatHook };
  const readBeat = hooked._beat;
  if (typeof readBeat === 'function') {
    hooked._beat = function (voice, node) {
      const first = voice.beats.length;
      readBeat.call(this, voice, node);
      const from = node.start?.offset;
      const to = node.end?.offset;
      if (from === undefined || to === undefined) return;
      for (const beat of voice.beats.slice(first)) ranges.set(beat, [from, to]);
    };
  }
  let score: alphaTab.model.Score | undefined;
  try {
    score = importer.readScore();
  } catch {
    // The diagnostics say why.
  }
  const errors = diagnostics(importer);
  if (!score && !errors.length) {
    errors.push({ message: 'The source could not be read.', line: 1, column: 1 });
  }
  return { score, errors, ranges };
}
