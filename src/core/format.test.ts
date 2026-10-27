import { mapOutside, singleSpaces, tidyLines } from './format';

test('tidies line ends, trailing blanks and blank lines', () => {
  expect(tidyLines('\r\n\nX:1 \r\nK:C\t\n\n\n\nX:2\nK:D\n\n')).toBe('X:1\nK:C\n\nX:2\nK:D\n');
  expect(tidyLines('  \n \n')).toBe('');
  expect(tidyLines('  indented')).toBe('  indented\n');
});

test('rewrites only the text outside the kept spans', () => {
  const upper = (gap: string) => gap.toUpperCase();
  expect(mapOutside('a "b" c % d', /"[^"]*"|%.*$/, upper)).toBe('A "b" C % d');
  expect(mapOutside('', /x/, upper)).toBe('');
});

test('collapses runs of spaces but keeps indentation', () => {
  expect(singleSpaces('  a   b\t\tc\n    d  e', '')).toBe('  a b c\n    d e');
  expect(singleSpaces('   a', '"')).toBe(' a');
  expect(singleSpaces('   a', '\n')).toBe('   a');
});
