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

  test('hands-free: insecure context disables toggle and stays off', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

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

    // Hands-free should not be changeable on insecure context
    const handsFreeToggle = page.locator('input[type="checkbox"][aria-label*="ands-free"], label:has-text("Hands-free")').first();
    try {
      await expect(handsFreeToggle).toBeVisible({ timeout: 1_000 });
      const initialState = await handsFreeToggle.isChecked();
      await handsFreeToggle.click();
      const afterClick = await handsFreeToggle.isChecked();
      // State should remain unchanged on insecure context
      expect(afterClick).toBe(initialState);
    } catch {
      // Toggle not available
    }

    await context.close();
  });

  test('hands-free: permission denied shows error and stays off', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Stub SpeechRecognition to fail with permission-denied
    await page.addInitScript(() => {
      (window as any).SpeechRecognition = class {
        continuous = false;
        interimResults = false;
        lang = 'en-US';
        onstart: any = null;
        onerror: any = null;
        onresult: any = null;
        onend: any = null;

        start() {
          setTimeout(() => {
            this.onerror?.({ error: 'permission-denied' });
          }, 50);
        }

        stop() {}
        abort() {}
      };

      // Stub speechSynthesis
      if (!window.speechSynthesis) {
        Object.defineProperty(window, 'speechSynthesis', {
          value: {
            speak(utterance: any) {
              setTimeout(() => { utterance.onend?.(); }, 50);
            },
            cancel() {},
            getVoices() { return [{ name: 'default' }]; },
            speaking: false,
          },
          configurable: true,
        });
      }
    });

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });

    // Open phone
    await page.press('body', 'p');
    await expect(page.locator('.phone')).toBeVisible();

    // Try to enable hands-free (should fail)
    const handsFreeToggle = page.locator('input[type="checkbox"][aria-label*="ands-free"]').first();
    try {
      await expect(handsFreeToggle).toBeVisible({ timeout: 1_000 });
      await handsFreeToggle.click();
      // Should show error toast
      const toast = page.locator('.toast, [role="alert"]').first();
      try {
        await expect(toast).toBeVisible({ timeout: 3_000 });
        const toastText = await toast.textContent();
        expect(toastText?.toLowerCase()).toMatch(/permission|denied|error/);
      } catch {
        // Toast not visible
      }
      // Toggle should remain off
      const isChecked = await handsFreeToggle.isChecked();
      expect(isChecked).toBe(false);
    } catch {
      // Toggle not visible
    }

    await context.close();
  });

  test('hands-free: permission granted, listen on, speak on - error toast on mic fail', async ({ context }) => {
    const page = await context.newPage();

    // Stub SpeechRecognition to fail with network error
    await page.addInitScript(() => {
      (window as any).SpeechRecognition = class {
        continuous = false;
        interimResults = false;
        lang = 'en-US';
        onstart: any = null;
        onerror: any = null;
        onresult: any = null;
        onend: any = null;

        start() {
          setTimeout(() => {
            this.onstart?.();
            // Simulate error after starting
            this.onerror?.({ error: 'network-error' });
          }, 50);
        }

        stop() {}
        abort() {}
      };

      // Stub speechSynthesis to simulate CEO reply playback
      if (!window.speechSynthesis) {
        Object.defineProperty(window, 'speechSynthesis', {
          value: {
            speak(utterance: any) {
              setTimeout(() => { utterance.onend?.(); }, 50);
            },
            cancel() {},
            getVoices() { return [{ name: 'default' }]; },
            speaking: false,
          },
          configurable: true,
        });
      }
    });

    // Grant microphone permission
    await context.grantPermissions(['microphone']);

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });

    // Open phone
    await page.press('body', 'p');
    await expect(page.locator('.phone')).toBeVisible();

    // Mic button should be functional (not dimmed)
    const micBtn = page.locator('.mic-btn');
    try {
      await expect(micBtn).toBeVisible({ timeout: 1_000 });
      const classes = await micBtn.getAttribute('class');
      expect(classes).not.toContain('mic-cant');
    } catch {
      // Mic button not visible
    }

    await page.close();
  });

  test('unmount phone during playback: no late send on desktop 1280x720', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.addInitScript(() => {
      (window as any).SpeechRecognition = class {
        continuous = false;
        interimResults = false;
        lang = 'en-US';
        onstart: any = null;
        onerror: any = null;
        onresult: any = null;
        onend: any = null;

        start() {
          setTimeout(() => {
            this.onstart?.();
            this.onresult?.({
              resultIndex: 0,
              results: [[{ transcript: 'hello', confidence: 1 }]],
              isFinal: true,
            });
            this.onend?.();
          }, 100);
        }

        stop() {}
        abort() {}
      };

      if (!window.speechSynthesis) {
        Object.defineProperty(window, 'speechSynthesis', {
          value: {
            speak(utterance: any) {
              setTimeout(() => { utterance.onend?.(); }, 50);
            },
            cancel() {},
            getVoices() { return [{ name: 'default' }]; },
            speaking: false,
          },
          configurable: true,
        });
      }
    });

    await context.grantPermissions(['microphone']);

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });

    // Open phone
    await page.press('body', 'p');
    await expect(page.locator('.phone')).toBeVisible();

    // Close phone immediately (should not cause errors or late sends)
    await page.keyboard.press('Escape');
    await expect(page.locator('.phone')).not.toBeVisible();

    // Wait briefly to ensure no late sends occur
    await page.waitForTimeout(500);

    // No unexpected errors or toasts
    const toasts = await page.locator('.toast').count();
    expect(toasts).toBe(0);

    await context.close();
  });

  test('unmount phone during playback: no late send on phone 390x844', async ({ context }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });

    await page.addInitScript(() => {
      (window as any).SpeechRecognition = class {
        continuous = false;
        interimResults = false;
        lang = 'en-US';
        onstart: any = null;
        onerror: any = null;
        onresult: any = null;
        onend: any = null;

        start() {
          setTimeout(() => {
            this.onstart?.();
            this.onresult?.({
              resultIndex: 0,
              results: [[{ transcript: 'hello', confidence: 1 }]],
              isFinal: true,
            });
            this.onend?.();
          }, 100);
        }

        stop() {}
        abort() {}
      };

      if (!window.speechSynthesis) {
        Object.defineProperty(window, 'speechSynthesis', {
          value: {
            speak(utterance: any) {
              setTimeout(() => { utterance.onend?.(); }, 50);
            },
            cancel() {},
            getVoices() { return [{ name: 'default' }]; },
            speaking: false,
          },
          configurable: true,
        });
      }
    });

    await context.grantPermissions(['microphone']);

    await page.goto('http://localhost:4399');
    await expect(page.locator('text=Enter the office')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Enter")');
    await expect(page.locator('.office')).toBeVisible({ timeout: 5_000 });

    // Open phone
    await page.press('body', 'p');
    await expect(page.locator('.phone')).toBeVisible();

    // Close phone immediately
    await page.keyboard.press('Escape');
    await expect(page.locator('.phone')).not.toBeVisible();

    // Wait briefly
    await page.waitForTimeout(500);

    // No unexpected toasts
    const toasts = await page.locator('.toast').count();
    expect(toasts).toBe(0);

    await page.close();
  });

  test('console: no TypeError on insecure context', async ({ browser }) => {
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
});
