const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const extensionPath = path.resolve(__dirname, '..');

/** Launch Chromium with the extension loaded and return { context, extensionId } */
async function loadExtension() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  // Wait for the service worker to register so we can grab the extension ID
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = sw.url().split('/')[2];

  return { context, extensionId };
}

let context;
let extensionId;

test.beforeAll(async () => {
  ({ context, extensionId } = await loadExtension());
});

test.afterAll(async () => {
  await context.close();
});

test('popup page loads with correct title', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  await expect(page).toHaveTitle('ResumeSync');
  await page.close();
});

test('all four tabs are visible', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  const tabs = page.locator('.tab-btn');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toHaveText('Resume');
  await expect(tabs.nth(1)).toHaveText('Preview');
  await expect(tabs.nth(2)).toHaveText('Versions');
  await expect(tabs.nth(3)).toHaveText('Compare');

  await page.close();
});

test('resume tab is active by default', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  await expect(page.locator('.tab-btn.active')).toHaveText('Resume');
  await expect(page.locator('#resume-tab')).toHaveClass(/active/);

  await page.close();
});

test('clicking a tab switches the active content', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  // Click the Versions tab
  await page.locator('.tab-btn[data-tab="versions"]').click();

  await expect(page.locator('.tab-btn[data-tab="versions"]')).toHaveClass(/active/);
  await expect(page.locator('#versions-tab')).toHaveClass(/active/);
  // Resume tab should no longer be active
  await expect(page.locator('#resume-tab')).not.toHaveClass(/active/);

  await page.close();
});

test('can fill in resume fields', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  await page.fill('#fullName', 'Jane Doe');
  await page.fill('#email', 'jane@example.com');
  await page.fill('#skills', 'JavaScript, Python');

  await expect(page.locator('#fullName')).toHaveValue('Jane Doe');
  await expect(page.locator('#email')).toHaveValue('jane@example.com');
  await expect(page.locator('#skills')).toHaveValue('JavaScript, Python');

  await page.close();
});
