import { test, expect } from '@playwright/test';
import { openHost, hostLogs } from './snHost.js';

test('loads the note into the source pane and saves edits', async ({ page }) => {
  const plugin = await openHost(page, { text: 'plain words' });

  const source = plugin.locator('.cm-content');
  await expect(source).toContainText('plain words');
  await source.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');

  await expect
    .poll(async () => (await hostLogs(page, 'save-items')).map((entry) => entry.text).pop())
    .toBe('plain words more');
});

test('menu bar opens with the keyboard and switches the view', async ({ page }) => {
  const plugin = await openHost(page, { text: 'x' });

  await plugin.getByRole('menuitem', { name: 'View' }).click();
  await plugin.getByRole('menuitemcheckbox', { name: 'Source only' }).click();
  await expect(plugin.locator('.render-pane')).toHaveCount(0);

  await plugin.getByRole('menuitem', { name: 'View' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(plugin.getByRole('menuitemcheckbox', { name: 'Split' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(plugin.locator('.render-pane')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.componentData.view)).toBe('split');
});

test('bars collapse and come back', async ({ page }) => {
  const plugin = await openHost(page, { text: 'x' });

  await plugin.getByRole('button', { name: 'Hide the bars' }).click();
  await expect(plugin.getByRole('menubar')).toHaveCount(0);
  await plugin.getByRole('button', { name: 'Show the menu' }).click();
  await expect(plugin.getByRole('menubar')).toBeVisible();
});

test('a locked note can be read but not edited', async ({ page }) => {
  const plugin = await openHost(page, { text: 'locked words', locked: true });

  await expect(plugin.getByRole('status')).toContainText('locked');
  await expect(plugin.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await plugin.locator('.cm-content').click();
  await page.keyboard.type('nope');
  await expect(plugin.locator('.cm-content')).toHaveText('locked words');
  expect(await hostLogs(page, 'save-items')).toEqual([]);
});

test('the caret and the selection show on a dark theme', async ({ page }) => {
  const plugin = await openHost(page, { text: 'some notes' });
  const source = plugin.locator('.cm-content');
  await expect(source).toContainText('some notes');

  await plugin.locator('body').evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      ':root { --sn-stylekit-contrast-foreground-color: rgb(230, 230, 230); --sn-stylekit-contrast-background-color: rgb(20, 20, 24); --sn-stylekit-info-color: rgb(80, 140, 255); }';
    document.head.appendChild(style);
  });

  expect(await source.evaluate((el) => getComputedStyle(el).caretColor)).toBe('rgb(230, 230, 230)');
  const selection = await source.evaluate(
    (el) => getComputedStyle(el.querySelector('.cm-line'), '::selection').backgroundColor
  );
  expect(selection).toBe('color(srgb 0.313726 0.54902 1 / 0.35)');
});
