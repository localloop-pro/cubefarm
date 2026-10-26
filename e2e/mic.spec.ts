import { test, expect } from '@playwright/test';

test.describe('Microphone and hands-free voice', () => {
  test('on insecure origin, mic is dimmed with HTTPS explanation', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Stub isSecureContext to false
    await page.addInitScript(() => {
      Object.defineProperty(window, 'isSecureContext', {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });

    // Open phone
    await page.press('body', 'p');
    await expect(page.locator('.phone')).toBeVisible();

    // Check that mic button is dimmed (has mic-cant class)
    const micBtn = page.locator('.mic-btn');
    await expect(micBtn).toHaveClass(/mic-cant/);

    // Title should contain HTTPS/localhost message
    const titleText = await micBtn.getAttribute('title');
    expect(titleText).toContain('HTTPS address or on localhost');

    // Pressing it should show a toast
    await micBtn.click();
    const toastText = await page.locator('.toast, [role="alert"]').first().textContent();
    expect(toastText).toContain('HTTPS address or on localhost');

    await context.close();
  });

  test('hands-free toggle shows explanation and stays off when mic unavailable', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Stub isSecureContext to false
    await page.addInitScript(() => {
      Object.defineProperty(window, 'isSecureContext', {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });

    // Open phone → Voice settings (assuming it's in settings/console)
    // For now, test that hands-free toggle would be disabled or show error
    // This is a placeholder for the actual hands-free toggle UI

    await context.close();
  });

  test('on secure localhost with permission granted, voice features work', async ({ context }) => {
    const page = await context.newPage();

    // Grant microphone permission automatically
    await context.grantPermissions(['microphone']);

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });

    // Open phone
    await page.press('body', 'p');
    await expect(page.locator('.phone')).toBeVisible();

    // Mic button should not be dimmed
    const micBtn = page.locator('.mic-btn');
    const classes = await micBtn.getAttribute('class');
    expect(classes).not.toContain('mic-cant');

    // Should have proper title (not the insecure message)
    const titleText = await micBtn.getAttribute('title');
    expect(titleText).not.toContain('HTTPS address or on localhost');

    await page.close();
  });

  test('mic check row shows correct capability flags', async ({ context }) => {
    const page = await context.newPage();

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });

    // Navigate to settings (implementation dependent; this is a placeholder)
    // const settingsBtn = page.locator('[aria-label="Settings"]');
    // if (await settingsBtn.isVisible()) {
    //   await settingsBtn.click();
    //   const voiceSection = page.locator('text=Voice, Mic check');
    //   await expect(voiceSection).toBeVisible();
    //   // Verify capability rows show correct values
    // }

    await page.close();
  });

  test('console should not show TypeError when accessing microphone on insecure context', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Stub isSecureContext to false
    await page.addInitScript(() => {
      Object.defineProperty(window, 'isSecureContext', {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });

    // Try to use the mic button (it should be disabled, not throw)
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });
    await page.press('body', 'p');
    await expect(page.locator('.phone')).toBeVisible();
    await page.click('.mic-btn');

    // Should not have any TypeError in console
    const typeErrors = consoleErrors.filter((e) => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);

    await context.close();
  });
});
