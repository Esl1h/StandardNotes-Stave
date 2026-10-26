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
