import * as alphaTab from '@coderline/alphatab';
import { alphaTexEngine } from '.';

/** Every diagnostic of alphaTab's own parser that is not a mere hint. */
function problems(src: string): string[] {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.logErrors = false;
  importer.initFromString(src, new alphaTab.Settings());
  try {
    importer.readScore();
  } catch {
    // The diagnostics say why.
  }
  return [
    ...importer.lexerDiagnostics.items,
    ...importer.parserDiagnostics.items,
    ...importer.semanticDiagnostics.items,
  ]
    .filter((diagnostic) => diagnostic.severity > 0)
    .map((diagnostic) => diagnostic.message);
}

test('the template is valid alphaTex that the engine detects', () => {
  const template = alphaTexEngine.template();
  expect(alphaTexEngine.detect(template)).toBe(true);
  expect(alphaTexEngine.title(template)).toBe('Untitled');
  expect(problems(template)).toEqual([]);
});

test('every tool writes valid alphaTex after the template', () => {
  for (const tool of alphaTexEngine.tools()) {
    const src = alphaTexEngine.template().trimEnd();
    const edit = alphaTexEngine.emit(tool.cmd, { src, from: src.length, to: src.length });
    const next = src.slice(0, edit.from) + edit.insert + src.slice(edit.to);
    expect([tool.id, problems(next)]).toEqual([tool.id, []]);
    expect(tool.label).not.toBe('');
    expect(tool.icon ?? tool.glyph).toBeTruthy();
  }
});

test('the cheat sheet examples are valid alphaTex', () => {
  const sections = alphaTexEngine.cheatsheet();
  expect(sections.map((section) => section.title)).toEqual([
    'Metadata',
    'Notes',
    'Bars and structure',
    'Techniques',
  ]);
  for (const section of sections.filter((each) => each.title !== 'Metadata')) {
    for (const row of section.rows) {
      const staff = /[A-G]\d/.test(row.syntax) ? '\\staff {score}\n' : '';
      expect([row.syntax, problems(`${staff}${row.syntax}`)]).toEqual([row.syntax, []]);
    }
  }
});
