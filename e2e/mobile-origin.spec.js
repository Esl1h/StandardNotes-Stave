import { test, expect } from '@playwright/test';
import { openHost, hostLogs } from './snHost.js';

// The mobile app runs its web UI from a local file inside a WebView, so the
// host origin is "null". An opaque-origin page may not load localhost, where
// the plugin is served in tests; in the app it comes from a public host.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

test('loads and saves the note when the host origin is opaque, as in the mobile app', async ({
  page,
}) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const plugin = await openHost(page, { text: 'mobile note', opaqueOrigin: true });

  const source = plugin.locator('.cm-content');
  await expect(source).toContainText('mobile note');
  await source.click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect
    .poll(async () => (await hostLogs(page, 'save-items')).map((entry) => entry.text).pop())
    .toBe('mobile note!');
  expect(pageErrors).toEqual([]);
});

test('the note survives a slow (throttled) mobile CPU', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const plugin = await openHost(page, { text: 'throttled note', throttle: 30 });

  await expect(plugin.locator('.cm-content')).toContainText('throttled note');
  expect(pageErrors).toEqual([]);
});

test('preferences survive reopening without localStorage', async ({ page }) => {
  // The opaque origin also blocks localStorage, as in the app's sandbox.
  const plugin = await openHost(page, { text: 'x', opaqueOrigin: true });
  await plugin.getByRole('menuitem', { name: 'View' }).click();
  await plugin.getByRole('menuitemcheckbox', { name: 'Stacked' }).click();
  await expect.poll(() => page.evaluate(() => window.componentData.orientation)).toBe('stacked');
  const saved = await page.evaluate(() => window.componentData);

  const reopened = await openHost(page, { text: 'x', opaqueOrigin: true, componentData: saved });
  await expect(reopened.locator('.panes.orientation-stacked')).toBeVisible();
});

test('a phone starts with the bars collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const plugin = await openHost(page, { text: 'x', platform: 'android', environment: 'mobile' });

  await expect(plugin.getByRole('button', { name: 'Show the menu' })).toBeVisible();
  await expect(plugin.getByRole('menubar')).toHaveCount(0);
});
