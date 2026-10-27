import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openHost, hostLogs } from './snHost.js';

const EXAMPLE = readFileSync('examples/chordpro.pro', 'utf8');

const lastSaved = async (page) =>
  (await hostLogs(page, 'save-items')).map((entry) => entry.text).pop();

const sheet = (plugin) => plugin.locator('.render-target .chordpro-sheet');

test('an empty note opens the ChordPro example', async ({ page }) => {
  const plugin = await openHost(page, { text: '' });
  await plugin.getByRole('button', { name: 'ChordPro example' }).click();

  await expect(sheet(plugin).locator('h1')).toHaveText('Morning on the Stave');
  await expect.poll(() => lastSaved(page)).toBe(EXAMPLE);
  await expect(plugin.getByRole('combobox', { name: 'Notation' })).toHaveValue('chordpro');
});

test('draws chords over the lyrics and shows errors in the source', async ({ page }) => {
  const plugin = await openHost(page, { text: '{title: Song}\nThe [G]sun [C]up\n{bogus: x}\n' });
  await expect(sheet(plugin).locator('.cp-chord').nth(1)).toHaveText('G');
  await expect(plugin.locator('.cm-lintRange-error')).toHaveCount(1);
});

test('toolbar buttons write ChordPro at the cursor', async ({ page }) => {
  const plugin = await openHost(page, { text: '{title: Song}\nla ' });
  await plugin.locator('.cm-content').click();
  await page.keyboard.press('Control+End');

  await plugin.getByRole('button', { name: 'Am chord' }).click();
  await expect.poll(() => lastSaved(page)).toBe('{title: Song}\nla [Am]');
  await plugin.getByRole('button', { name: 'Chorus', exact: false }).click();
  await expect.poll(() => lastSaved(page)).toContain('{start_of_chorus}\n\n{end_of_chorus}');
});

test('clicking a chord selects its source, and transposition moves the chords', async ({
  page,
}) => {
  const plugin = await openHost(page, { text: '{key: G}\nThe [G]sun [D/F#]up\n' });
  await sheet(plugin).locator('.cp-chord', { hasText: 'D/F#' }).click();
  await expect
    .poll(() => plugin.locator('.cm-content').evaluate(() => getSelection()?.toString() ?? ''))
    .toBe('D/F#');

  await plugin.getByRole('button', { name: 'Transpose up' }).click();
  await expect.poll(() => lastSaved(page)).toBe('{key: G#}\nThe [G#]sun [D#/G]up\n');
});

test('exports SVG named after the title', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  await expect(sheet(plugin)).toBeVisible();
  await plugin.getByRole('menuitem', { name: 'File' }).click();
  const download = page.waitForEvent('download');
  await plugin.getByRole('menuitem', { name: 'Export SVG image' }).click();
  expect((await download).suggestedFilename()).toBe('Morning on the Stave.svg');
});

test('prints the sheet', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  await expect(sheet(plugin)).toBeVisible();
  await plugin.locator('body').evaluate(() => {
    window.printed = 0;
    window.print = () => window.printed++;
  });

  await plugin.getByRole('menuitem', { name: 'File' }).click();
  await plugin.getByRole('menuitem', { name: 'Print or PDF' }).click();

  await expect.poll(() => plugin.locator('body').evaluate(() => window.printed)).toBe(1);
  const image = plugin.locator('.print-sheet img');
  expect(await image.evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([
    expect.any(Number),
    expect.any(Number),
  ]);
  expect(await image.evaluate((img) => img.naturalHeight)).toBeGreaterThan(300);
});
