import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openHost, hostLogs } from './snHost.js';

// The opaque-origin host may not load the plugin from localhost otherwise;
// in the app it comes from a public host.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

const EXAMPLE = readFileSync('examples/alphatex.atex', 'utf8');
const HEADER = '\\title "Test"\n\\tempo 240\n\\track "Guitar"\n\\staff {score tabs}\n';

const lastSaved = async (page) =>
  (await hostLogs(page, 'save-items')).map((entry) => entry.text).pop();

const rendering = (plugin) => plugin.locator('.render-target .at-surface svg');

test('an empty note opens the alphaTex example', async ({ page }) => {
  const plugin = await openHost(page, { text: '' });

  await plugin.getByRole('button', { name: 'alphaTex example' }).click();

  await expect(rendering(plugin).first()).toBeVisible();
  await expect.poll(() => lastSaved(page)).toMatch(/^\\title "Morning on the Stave"\n/);
  await plugin.getByRole('menuitem', { name: 'Play' }).click();
  for (const track of ['Melody', 'Rhythm', 'Bass']) {
    await expect(plugin.getByRole('menuitemcheckbox', { name: `Mute ${track}` })).toBeVisible();
  }
});

test('an empty note starts from the alphaTex template', async ({ page }) => {
  const plugin = await openHost(page, { text: '' });

  await plugin.getByRole('button', { name: 'alphaTex', exact: true }).click();

  await expect(rendering(plugin).first()).toBeVisible();
  await expect.poll(() => lastSaved(page)).toMatch(/^\\title "Untitled"\n/);
  await expect(plugin.getByRole('combobox', { name: 'Notation' })).toHaveValue('alphatex');
});

test('renders the example with its three tracks and redraws after edits', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  await expect(rendering(plugin).first()).toBeVisible();
  await expect(plugin.locator('.render-target')).toContainText('Morning on the Stave');

  const edited = await openHost(page, { text: `${HEADER}3.3.4` });
  await expect(rendering(edited).first()).toBeVisible();
  const before = await edited.locator('.render-target .at-surface').innerHTML();
  await edited.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' 5.3 7.3 8.3');
  await expect
    .poll(() => edited.locator('.render-target .at-surface').innerHTML(), { timeout: 5000 })
    .not.toBe(before);
});

test('errors show in the source and keep the last rendering', async ({ page }) => {
  const plugin = await openHost(page, { text: `${HEADER}3.3.4 5.9` });

  await expect(plugin.locator('.cm-lintRange-error')).toHaveCount(1);
  await expect(plugin.locator('.cm-lint-marker-error')).toHaveCount(1);
});

test('toolbar buttons write alphaTex at the cursor', async ({ page }) => {
  const plugin = await openHost(page, { text: `${HEADER}3.3.4` });
  await plugin.locator('.cm-content').click();
  await page.keyboard.press('Control+End');

  await plugin.getByRole('button', { name: 'Eighth note' }).click();
  await plugin.getByRole('button', { name: 'Palm mute' }).click();
  await plugin.getByRole('button', { name: 'Bar line', exact: true }).click();

  await expect.poll(() => lastSaved(page)).toBe(`${HEADER}3.3.4 3.3{pm}.8 |`);
});

test('clicking a beat selects its source, and the cursor marks the beat', async ({ page }) => {
  const src = `${HEADER}3.3.4 5.3 7.3 8.3`;
  const plugin = await openHost(page, { text: src });
  await expect(rendering(plugin).first()).toBeVisible();

  // The third beat: its fret number on the tab staff.
  const fret = plugin.locator('.render-target .at-surface text', { hasText: /^7$/ }).first();
  await fret.click();
  await expect
    .poll(() => plugin.locator('.cm-content').evaluate(() => getSelection()?.toString() ?? ''))
    .toBe('7.3');

  await plugin.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await expect(plugin.locator('.render-target .stave-beat-marker')).toBeVisible();
});

test('transposes the source a semitone up and down', async ({ page }) => {
  const src = `${HEADER}3.3.4 (0.1 2.2).2{ch "Am"}`;
  const plugin = await openHost(page, { text: src });
  await expect(rendering(plugin).first()).toBeVisible();

  await plugin.getByRole('button', { name: 'Transpose up' }).click();
  await expect.poll(() => lastSaved(page)).toBe(`${HEADER}4.3.4 (1.1 3.2).2{ch "A#m"}`);
  await plugin.getByRole('button', { name: 'Transpose down' }).click();
  await expect.poll(() => lastSaved(page)).toBe(`${HEADER}3.3.4 (0.1 2.2).2{ch "Am"}`);
});

test('exports SVG, MIDI and Guitar Pro files named after the title', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  await expect(rendering(plugin).first()).toBeVisible();

  for (const [label, name] of [
    ['Export SVG image', 'Morning on the Stave.svg'],
    ['Export MIDI file', 'Morning on the Stave.mid'],
    ['Export Guitar Pro 7', 'Morning on the Stave.gp'],
  ]) {
    await plugin.getByRole('menuitem', { name: 'File' }).click();
    const download = page.waitForEvent('download');
    await plugin.getByRole('menuitem', { name: label }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(name);
    if (name.endsWith('.svg')) {
      const svg = readFileSync(await file.path(), 'utf8');
      expect(svg).toContain('data:font/woff2;base64,');
      expect(svg).toContain('Morning on the Stave');
    }
  }
});

test('switches between score, tab and both', async ({ page }) => {
  const plugin = await openHost(page, { text: `${HEADER}3.3.4 5.3` });
  await expect(rendering(plugin).first()).toBeVisible();
  const height = () =>
    plugin.locator('.render-target .at-surface').evaluate((el) => el.scrollHeight);
  const both = await height();

  await plugin.getByRole('menuitem', { name: 'View' }).click();
  await plugin.getByRole('menuitemcheckbox', { name: 'Tab', exact: true }).click();
  await expect.poll(height).toBeLessThan(both);
  await expect.poll(() => page.evaluate(() => window.componentData['render-view'])).toBe('tab');
});

// Playback runs in a worker started from a blob, the only way inside the
// opaque origin of the Standard Notes iframe (docs/adr/0015).
for (const opaqueOrigin of [false, true]) {
  test(`plays with the bundled SoundFont${opaqueOrigin ? ' in an opaque origin' : ''}`, async ({
    page,
  }) => {
    const remote = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== 'localhost') remote.push(request.url());
    });
    const pageErrors = [];
    page.on('pageerror', (error) => {
      // alphaTab 1.8.4's web audio output stops a buffer source it never
      // started when playback stops, with some outputs (the CI's Chromium);
      // the stop itself works.
      if (/cannot call stop without calling start first/.test(error.message)) return;
      pageErrors.push(error.message);
    });
    const plugin = await openHost(page, {
      text: `${HEADER}0.3.8 2.3 3.3 5.3 | 7.3.8 5.3 3.3 2.3 | 0.3.2 r.2`,
      opaqueOrigin,
    });
    await expect(rendering(plugin).first()).toBeVisible();

    await plugin.getByRole('button', { name: 'Play', exact: true }).click();
    const cursor = plugin.locator('.at-cursor-beat');
    const position = () => cursor.evaluate((el) => el.style.transform);
    const start = await position();
    await expect.poll(position, { timeout: 15000 }).not.toBe(start);
    await plugin.getByRole('button', { name: 'Stop' }).click();
    await expect(plugin.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(plugin.getByRole('alert')).toHaveCount(0);
    expect(remote).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test('plays with the metronome and a count-in', async ({ page }) => {
  const plugin = await openHost(page, { text: `${HEADER}0.3.4 2.3 3.3 5.3 | 7.3.2 5.3` });
  await expect(rendering(plugin).first()).toBeVisible();

  for (const item of ['Metronome', 'Count-in']) {
    await plugin.getByRole('menuitem', { name: 'Play' }).click();
    await plugin.getByRole('menuitemcheckbox', { name: item }).click();
  }
  await plugin.getByRole('menuitem', { name: 'Play' }).click();
  await expect(plugin.getByRole('menuitemcheckbox', { name: 'Count-in' })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await page.keyboard.press('Escape');

  await plugin.getByRole('button', { name: 'Play', exact: true }).click();
  const cursor = plugin.locator('.at-cursor-beat');
  const start = await cursor.evaluate((el) => el.style.transform);
  await expect
    .poll(() => cursor.evaluate((el) => el.style.transform), { timeout: 15000 })
    .not.toBe(start);
  await expect(plugin.getByRole('alert')).toHaveCount(0);
  await plugin.getByRole('button', { name: 'Stop' }).click();
});

test('mutes and solos a track from the Play menu', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  await expect(rendering(plugin).first()).toBeVisible();

  await plugin.getByRole('menuitem', { name: 'Play' }).click();
  await plugin.getByRole('menuitemcheckbox', { name: 'Mute Bass' }).click();
  await plugin.getByRole('menuitem', { name: 'Play' }).click();
  await expect(plugin.getByRole('menuitemcheckbox', { name: 'Mute Bass' })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(plugin.getByRole('menuitemcheckbox', { name: 'Solo Melody' })).toHaveAttribute(
    'aria-checked',
    'false'
  );
});

test('follows a dark theme', async ({ page }) => {
  const plugin = await openHost(page, { text: `${HEADER}3.3.4` });
  await expect(rendering(plugin).first()).toBeVisible();

  await plugin.locator('body').evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      ':root { --sn-stylekit-contrast-foreground-color: rgb(230, 230, 230); --sn-stylekit-neutral-color: rgb(150, 150, 150); }';
    document.head.appendChild(style);
  });

  await expect
    .poll(() => plugin.locator('.render-target .at-surface').innerHTML())
    .toContain('#E6E6E6');
});

test('a phone stacks the panes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const plugin = await openHost(page, {
    text: EXAMPLE,
    platform: 'android',
    environment: 'mobile',
  });

  const source = await plugin.locator('.source-pane').boundingBox();
  const render = await plugin.locator('.render-pane').boundingBox();
  expect(render.y).toBeGreaterThan(source.y);
  await expect(rendering(plugin).first()).toBeVisible();
});

test('lays the music out in one system that scrolls across', async ({ page }) => {
  const plugin = await openHost(page, { text: EXAMPLE });
  const scroll = plugin.locator('.render-scroll');
  await expect(rendering(plugin).first()).toBeVisible();
  const height = await scroll.evaluate((el) => el.scrollHeight);

  await plugin.getByRole('menuitem', { name: 'View' }).click();
  await plugin.getByRole('menuitemcheckbox', { name: 'Horizontal layout' }).click();

  await expect
    .poll(() => scroll.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeGreaterThan(200);
  expect(await scroll.evaluate((el) => el.scrollHeight)).toBeLessThan(height);
  await expect.poll(() => page.evaluate(() => window.componentData.layout)).toBe('horizontal');
});
