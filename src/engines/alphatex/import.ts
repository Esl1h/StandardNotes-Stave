import * as alphaTab from '@coderline/alphatab';

/**
 * Files alphaTab reads, turned into alphaTex. Loaded on demand with the
 * renderer's copy of alphaTab. MIDI is not among them: alphaTab has no MIDI
 * importer (docs/adr/0008).
 */
export function toAlphaTex(data: Uint8Array): string {
  const settings = new alphaTab.Settings();
  let score: alphaTab.model.Score;
  try {
    score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(data, settings);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The file is not a score alphaTab can read (${reason}).`, { cause: error });
  }
  return new alphaTab.exporter.AlphaTexExporter().exportToString(score, settings);
}
