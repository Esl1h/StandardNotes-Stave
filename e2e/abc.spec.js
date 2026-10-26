import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openHost, hostLogs } from './snHost.js';

const EXAMPLE = readFileSync('examples/abc.abc', 'utf8');

const lastSaved = async (page) =>
  (await hostLogs(page, 'save-items')).map((entry) => entry.text).pop();

test('an empty note starts from the ABC template', async ({ page }) => {
  const plugin = await openHost(page, { text: '' });

  await plugin.getByRole('button', { name: 'ABC' }).click();

  await expect(plugin.locator('.render-target svg')).toBeVisible();
  await expect.poll(() => lastSaved(page)).toMatch(/^X:1\nT:Untitled\n/);
  await expect(plugin.getByRole('combobox', { name: 'Notation' })).toHaveValue('abc');
});

test('renders the example and redraws after edits', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  await expect(plugin.locator('.render-target svg')).toBeVisible();
  await expect(plugin.locator('.render-target')).toContainText('Morning on the Stave');

  const edited = await openHost(page, { text: 'X:1\nL:1/8\nK:C\nCDEF|' });
  const notes = edited.locator('.render-target .abcjs-note');
  await expect(notes).toHaveCount(4);
  await edited.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' GABc |]');
  await expect(notes).toHaveCount(8);
});

test('errors show in the source without breaking the rendering', async ({ page }) => {
  const plugin = await openHost(page, { text: 'X:1\nK:C\nCD Q EF|]\n' });

  await expect(plugin.locator('.cm-lintRange-error')).toHaveCount(1);
  await expect(plugin.locator('.render-target svg')).toBeVisible();
});

test('toolbar buttons write ABC at the cursor', async ({ page }) => {
  const plugin = await openHost(page, { text: 'X:1\nL:1/8\nK:C\nC' });
  const source = plugin.locator('.cm-content');
  await source.click();
  await page.keyboard.press('Control+End');

  await plugin.getByRole('button', { name: 'Quarter note' }).click();
  await plugin.getByRole('button', { name: 'Sharp' }).click();
  await plugin.getByRole('button', { name: 'Bar line', exact: true }).click();

  await expect.poll(() => lastSaved(page)).toBe('X:1\nL:1/8\nK:C\nC^C2 |');
});

test('duration keys work outside the source and with Alt inside it', async ({ page }) => {
  const plugin = await openHost(page, { text: 'X:1\nL:1/8\nK:C\nE' });
  const source = plugin.locator('.cm-content');
  await source.click();
  await page.keyboard.press('Control+End');

  await page.keyboard.press('Alt+3');
  await expect.poll(() => lastSaved(page)).toBe('X:1\nL:1/8\nK:C\nEE2');
});

test('clicking a note selects its source, and the cursor highlights the note', async ({ page }) => {
  const src = 'X:1\nL:1/8\nK:C\nC D E F|]\n';
  const plugin = await openHost(page, { text: src });
  await expect(plugin.locator('.render-target .abcjs-note')).toHaveCount(4);

  // abcjs listens on the SVG and finds the nearest element to the pointer.
  const third = await plugin.locator('.render-target .abcjs-note').nth(2).boundingBox();
  await page.mouse.click(third.x + third.width / 2, third.y + third.height / 2);
  await expect
    .poll(() => plugin.locator('.cm-content').evaluate(() => getSelection()?.toString() ?? ''))
    .toBe('E');

  await plugin.locator('.cm-content').click();
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < src.indexOf('D') + 1; i++) await page.keyboard.press('ArrowRight');
  await expect(plugin.locator('.render-target .stave-highlight').first()).toBeVisible();
});

test('transposes the source a semitone up and down', async ({ page }) => {
  const plugin = await openHost(page, { text: 'X:1\nL:1/8\nK:C\nCDE|]\n' });
  await expect(plugin.locator('.render-target svg')).toBeVisible();

  await plugin.getByRole('button', { name: 'Transpose up' }).click();
  await expect.poll(() => lastSaved(page)).toContain('K:Db');
  await plugin.getByRole('button', { name: 'Transpose down' }).click();
  await expect.poll(() => lastSaved(page)).toBe('X:1\nL:1/8\nK:C\nCDE|]\n');
});

test('exports SVG and MIDI files named after the title', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  await expect(plugin.locator('.render-target svg')).toBeVisible();

  for (const [label, name] of [
    ['Export SVG image', 'Morning on the Stave.svg'],
    ['Export MIDI file', 'Morning on the Stave.mid'],
  ]) {
    await plugin.getByRole('menuitem', { name: 'File' }).click();
    const download = page.waitForEvent('download');
    await plugin.getByRole('menuitem', { name: label }).click();
    expect((await download).suggestedFilename()).toBe(name);
  }
});

test('plays with the bundled piano samples and never a CDN', async ({ page }) => {
  const remote = [];
  const samples = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost') remote.push(request.url());
    if (url.pathname.includes('/soundfont/')) samples.push(url.pathname);
  });
  const plugin = await openHost(page, { text: 'X:1\nL:1/8\nQ:1/4=240\nK:C\nCDEF|]\n' });
  await expect(plugin.locator('.render-target svg')).toBeVisible();

  await plugin.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(plugin.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => samples.length).toBeGreaterThan(0);
  expect(samples.every((path) => path.includes('acoustic_grand_piano-mp3'))).toBe(true);
  await plugin.getByRole('button', { name: 'Stop' }).click();
  await expect(plugin.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(remote).toEqual([]);
});

test('follows a dark theme', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  await expect(plugin.locator('.render-target svg')).toBeVisible();

  // What a theme stylesheet from the host does: redefine the variables.
  await plugin.locator('body').evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      ':root { --sn-stylekit-contrast-foreground-color: rgb(230, 230, 230); --sn-stylekit-contrast-background-color: rgb(20, 20, 24); }';
    document.head.appendChild(style);
  });

  await expect
    .poll(() =>
      plugin
        .locator('.render-target svg path[fill]')
        .first()
        .evaluate((path) => path.getAttribute('fill'))
    )
    .toBe('rgb(230, 230, 230)');
});

test('a phone stacks the panes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const plugin = await openHost(page, {
    text: EXAMPLE,
    platform: 'android',
    environment: 'mobile',
  });

  const source = await plugin.locator('.source-pane').boundingBox();
  const rendering = await plugin.locator('.render-pane').boundingBox();
  expect(rendering.y).toBeGreaterThan(source.y);
  await expect(plugin.locator('.render-target svg')).toBeVisible();
});
