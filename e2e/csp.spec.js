import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openHost } from './snHost.js';

const EXAMPLE = readFileSync('examples/abc.abc', 'utf8');

// See mobile-origin.spec.js: the opaque host may not load localhost.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

// The built page carries a Content Security Policy (docs/adr/0005); drawing
// and playing a note may not trip it, in the web host or in the
// opaque-origin mobile one.
for (const opaqueOrigin of [false, true]) {
  test(`drawing and playing ABC trips no CSP rule${opaqueOrigin ? ', opaque origin' : ''}`, async ({
    page,
  }) => {
    const violations = [];
    page.on('console', (message) => {
      if (/Content Security Policy/.test(message.text())) violations.push(message.text());
    });

    let samples = 0;
    page.on('requestfinished', (request) => {
      if (request.url().includes('/soundfont/')) samples++;
    });

    const plugin = await openHost(page, { text: EXAMPLE, opaqueOrigin });

    await expect(plugin.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    await expect(plugin.locator('.render-target svg')).toBeVisible();
    await plugin.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => samples).toBeGreaterThan(0);
    await plugin.getByRole('button', { name: 'Stop' }).click();
    expect(violations).toEqual([]);
  });
}

const ALPHATEX = readFileSync('examples/alphatex.atex', 'utf8');

// alphaTab starts its player worker from a blob (docs/adr/0015).
for (const opaqueOrigin of [false, true]) {
  test(`drawing and playing alphaTex trips no CSP rule${opaqueOrigin ? ', opaque origin' : ''}`, async ({
    page,
  }) => {
    const violations = [];
    page.on('console', (message) => {
      if (/Content Security Policy/.test(message.text())) violations.push(message.text());
    });

    const plugin = await openHost(page, { text: ALPHATEX, opaqueOrigin });

    await expect(plugin.locator('.render-target .at-surface svg').first()).toBeVisible();
    await plugin.getByRole('button', { name: 'Play', exact: true }).click();
    const cursor = plugin.locator('.at-cursor-beat');
    const start = await cursor.evaluate((el) => el.style.transform);
    await expect.poll(() => cursor.evaluate((el) => el.style.transform)).not.toBe(start);
    await plugin.getByRole('button', { name: 'Stop' }).click();
    expect(violations).toEqual([]);
  });
}
