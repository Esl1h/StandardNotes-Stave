import { test, expect } from '@playwright/test';
import { openHost } from './snHost.js';

// See mobile-origin.spec.js: the opaque host may not load localhost.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

// The built page carries a Content Security Policy (docs/adr/0005); opening
// a note may not trip it, in the web host or in the opaque-origin mobile one.
for (const opaqueOrigin of [false, true]) {
  test(`opening a note trips no CSP rule${opaqueOrigin ? ', opaque origin' : ''}`, async ({
    page,
  }) => {
    const violations = [];
    page.on('console', (message) => {
      if (/Content Security Policy/.test(message.text())) violations.push(message.text());
    });

    const plugin = await openHost(page, { text: 'some text', opaqueOrigin });

    await expect(plugin.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    await expect(plugin.locator('.cm-content')).toContainText('some text');
    expect(violations).toEqual([]);
  });
}
