const { test, expect } = require('@playwright/test');
const { sampleResume, launchExtension, openPopup, clearStorage } = require('./helpers');

let context, extensionId;

test.beforeAll(async () => { ({ context, extensionId } = await launchExtension()); });
test.afterAll(async () => { await context.close(); });

test.describe('Popup basics', () => {
  test('popup loads with correct title', async () => {
    const page = await openPopup(context, extensionId);
    await expect(page).toHaveTitle('ResumeSync');
    await page.close();
  });

  test('all four tabs are visible', async () => {
    const page = await openPopup(context, extensionId);
    const tabs = page.locator('.tab-btn');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('Resume');
    await expect(tabs.nth(1)).toHaveText('Preview');
    await expect(tabs.nth(2)).toHaveText('Versions');
    await expect(tabs.nth(3)).toHaveText('Compare');
    await page.close();
  });

  test('resume tab is active by default', async () => {
    const page = await openPopup(context, extensionId);
    await expect(page.locator('.tab-btn.active')).toHaveText('Resume');
    await expect(page.locator('#resume-tab')).toHaveClass(/active/);
    await page.close();
  });

  test('all form fields are present in the Resume tab', async () => {
    const page = await openPopup(context, extensionId);
    await expect(page.locator('#fullName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#summary')).toBeVisible();
    await expect(page.locator('#skills')).toBeVisible();
    await expect(page.locator('#versionNotes')).toBeVisible();
    await expect(page.locator('#saveResume')).toBeVisible();
    await expect(page.locator('#loadResume')).toBeVisible();
    await expect(page.locator('#importResumeBtn')).toBeVisible();
    await expect(page.locator('#exportResumeBtn')).toBeVisible();
    await page.close();
  });
});

test.describe('UI responsiveness (<200ms)', () => {
  test('tab switching responds within 200ms', async () => {
    const page = await openPopup(context, extensionId);
    for (const tabName of ['versions', 'compare', 'resumePreview', 'resume']) {
      const elapsed = await page.evaluate((tab) => {
        const start = performance.now();
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).click();
        return performance.now() - start;
      }, tabName);
      expect(elapsed).toBeLessThan(200);
      await expect(page.locator(`#${tabName}-tab`)).toHaveClass(/active/);
    }
    await page.close();
  });

  test('Add Education button responds within 200ms', async () => {
    const page = await openPopup(context, extensionId);
    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      document.getElementById('addEdu').click();
      return performance.now() - start;
    });
    expect(elapsed).toBeLessThan(200);
    await expect(page.locator('#eduList .entry-card')).toHaveCount(1);
    await page.close();
  });

  test('Add Experience button responds within 200ms', async () => {
    const page = await openPopup(context, extensionId);
    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      document.getElementById('addExp').click();
      return performance.now() - start;
    });
    expect(elapsed).toBeLessThan(200);
    await expect(page.locator('#expList .entry-card')).toHaveCount(1);
    await page.close();
  });

  test('card delete button responds within 200ms', async () => {
    const page = await openPopup(context, extensionId);
    await page.locator('#addEdu').click();
    await expect(page.locator('#eduList .entry-card')).toHaveCount(1);
    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      document.querySelector('#eduList .card-delete-btn').click();
      return performance.now() - start;
    });
    expect(elapsed).toBeLessThan(200);
    await expect(page.locator('#eduList .entry-card')).toHaveCount(0);
    await page.close();
  });
});
