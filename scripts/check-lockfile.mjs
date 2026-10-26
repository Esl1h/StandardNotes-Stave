#!/usr/bin/env node
// Fails when package-lock.json pulls any code from git instead of the npm
// registry (docs/adr/0007-no-git-dependencies.md). Runs before `npm ci`,
// so such a dependency never gets to run its install scripts.
import { readFileSync } from 'node:fs';

// Covers git+ssh/git+https URLs, the github: shorthand and tarballs from
// codeload, in both the packages and the legacy dependencies sections.
const gitRef = /"(?:git\+[^"]+|git:\/\/[^"]+|github:[^"]+|https:\/\/codeload\.github\.com\/[^"]+)"/g;

const lock = readFileSync('package-lock.json', 'utf8');
const bad = new Set([...lock.matchAll(gitRef)].map(([match]) => match.slice(1, -1)));

if (bad.size) {
  for (const ref of bad) console.error(`git dependency: ${ref}`);
  process.exit(1);
}
console.log('package-lock.json: every dependency comes from the registry');
