#!/usr/bin/env node
// Reports the raw and gzip size of every file in build/, split into what
// opening the editor loads (index.html and what it references) and what
// loads later on demand (engine chunks, fonts, SoundFonts). See
// docs/adr/0013-bundle-budget.md.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = 'build';
// Fetched by the host or kept for people, not by the page.
const skip = /^(ext(\.dev)?\.json|package\.json|THIRD_PARTY_LICENSES\.md|robots\.txt)$/;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [relative(root, join(dir, entry.name))]
  );

const html = readFileSync(join(root, 'index.html'), 'utf8');
const rows = walk(root)
  .filter((file) => !skip.test(file))
  .map((file) => {
    const body = readFileSync(join(root, file));
    return {
      file,
      raw: body.length,
      gzip: gzipSync(body, { level: 9 }).length,
      initial: file === 'index.html' || html.includes(file),
    };
  })
  .sort((a, b) => b.gzip - a.gzip);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const total = (list, key) => list.reduce((sum, row) => sum + row[key], 0);

for (const [title, list] of [
  ['Initial load', rows.filter((row) => row.initial)],
  ['Lazy', rows.filter((row) => !row.initial)],
]) {
  console.log(`${title}: ${kb(total(list, 'raw'))} raw, ${kb(total(list, 'gzip'))} gzip`);
  for (const row of list) console.log(`  ${row.file}  ${kb(row.raw)} raw, ${kb(row.gzip)} gzip`);
}
