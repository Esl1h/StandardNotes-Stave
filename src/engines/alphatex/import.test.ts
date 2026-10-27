import * as alphaTab from '@coderline/alphatab';
import { readFileSync } from 'node:fs';
import { parse } from './parse';
import { toAlphaTex } from './import';

const MUSICXML = `<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
  </measure></part>
</score-partwise>`;

const notes = (score: alphaTab.model.Score) =>
  score.tracks.flatMap((track) =>
    track.staves.flatMap((staff) =>
      staff.bars.flatMap((bar) =>
        bar.voices.flatMap((voice) =>
          voice.beats.flatMap((beat) => beat.notes.map((n) => n.realValue))
        )
      )
    )
  );

test('turns a Guitar Pro file into alphaTex with the same notes', () => {
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(
    readFileSync('examples/alphatex.atex', 'utf8'),
    settings
  );
  const gp = new alphaTab.exporter.Gp7Exporter().export(score, settings);

  const tex = toAlphaTex(gp);
  const parsed = parse(tex, settings);
  expect(parsed.errors).toEqual([]);
  expect(parsed.score?.tracks.map((track) => track.name)).toEqual(['Melody', 'Rhythm', 'Bass']);
  expect(notes(parsed.score!)).toEqual(notes(score));
});

test('turns MusicXML into alphaTex', () => {
  const tex = toAlphaTex(new TextEncoder().encode(MUSICXML));
  const parsed = parse(tex, new alphaTab.Settings());
  expect(parsed.errors).toEqual([]);
  expect(notes(parsed.score!)).toEqual([60, 64]);
});

test('says when a file is not a score', () => {
  expect(() => toAlphaTex(new TextEncoder().encode('not music'))).toThrow(
    /not a score alphaTab can read/
  );
});
