import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { openHost } from './snHost.js';

// Automated WCAG 2.1 A and AA checks: names, roles, keyboard reach and the
// contrast of the UI in the default theme and a dark one.
const EXAMPLES = {
  ABC: readFileSync('examples/abc.abc', 'utf8'),
  alphaTex: readFileSync('examples/alphatex.atex', 'utf8'),
  ChordPro: readFileSync('examples/chordpro.pro', 'utf8'),
};

// What a dark theme from the app does: redefine the stylekit variables.
const DARK = `:root {
  --sn-stylekit-background-color: #1c1c20;
  --sn-stylekit-foreground-color: #e6e6e6;
  --sn-stylekit-contrast-background-color: #141418;
  --sn-stylekit-contrast-foreground-color: #e6e6e6;
  --sn-stylekit-secondary-background-color: #2a2a30;
  --sn-stylekit-neutral-color: #a0a0a8;
  --sn-stylekit-border-color: #3a3a40;
  --sn-stylekit-info-color: #6aa9ff;
}`;

const audit = async (page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The test host's own page; the app names its frame and document.
    .disableRules(['document-title', 'html-has-lang', 'frame-title'])
    // The drawings are images of music, named by the library that draws them.
    .exclude([['#f', '.render-target']])
    .analyze();
  return violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((node) => node.target.join(' ')).join(', ')})`
  );
};

for (const [name, text] of Object.entries(EXAMPLES)) {
  for (const dark of [false, true]) {
    test(`${name}${dark ? ' on a dark theme' : ''}: no WCAG violations`, async ({ page }) => {
      const plugin = await openHost(page, { text });
      await expect(
        plugin.locator('.render-target :is(svg, .chordpro-sheet)').first()
      ).toBeVisible();
      if (dark) {
        await plugin.locator('body').evaluate((body, css) => {
          const style = document.createElement('style');
          style.textContent = css;
          body.ownerDocument.head.appendChild(style);
        }, DARK);
      }
      expect(await audit(page)).toEqual([]);

      await plugin.getByRole('menuitem', { name: 'Play' }).click();
      expect(await audit(page)).toEqual([]);
      await page.keyboard.press('Escape');

      await plugin.getByRole('menuitem', { name: 'Help' }).click();
      await plugin.getByRole('menuitem', { name: /cheat sheet/ }).click();
      await expect(plugin.getByRole('dialog')).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });
  }
}

test('a phone with the drawer open: no WCAG violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const plugin = await openHost(page, {
    text: EXAMPLES.ABC,
    platform: 'android',
    environment: 'mobile',
  });
  await expect(plugin.locator('.render-target svg').first()).toBeVisible();
  await plugin.getByRole('button', { name: 'Insert' }).click();
  expect(await audit(page)).toEqual([]);
});
