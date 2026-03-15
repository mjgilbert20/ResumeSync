const { test, expect } = require('@playwright/test');
const { sampleResume, launchExtension, openPopup, clearStorage } = require('./helpers');

let context, extensionId;

test.beforeAll(async () => { ({ context, extensionId } = await launchExtension()); });
test.afterAll(async () => { await context.close(); });

test.describe('Version History', () => {
  test('saving a resume creates a version entry', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    await page.fill('#fullName', 'Version Test');
    await page.fill('#email', 'v@test.com');
    await page.fill('#versionNotes', 'My first save');
    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    await page.locator('.tab-btn[data-tab="versions"]').click();
    await page.waitForTimeout(300);
    await page.locator('.tab-btn[data-tab="resume"]').click();
    await page.locator('.tab-btn[data-tab="versions"]').click();

    await expect(page.locator('.version-item')).toHaveCount(1);
    await expect(page.locator('.version-notes')).toContainText('My first save');
    await expect(page.locator('.version-summary')).toContainText('Version Test');
    await page.close();
  });

  test('empty version history shows placeholder', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);
    await page.locator('.tab-btn[data-tab="versions"]').click();
    await expect(page.locator('.empty-state')).toContainText('No versions saved yet');
    await page.close();
  });

  test('restoring a version populates the form and switches to Resume tab', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    await page.evaluate(async () => {
      const v1 = { id: 1000, data: { fullName: 'Old User', email: 'old@test.com', summary: 'Old summary', education: [], experience: [], skills: ['OldSkill'] }, notes: 'Old version', timestamp: new Date().toISOString() };
      const v2 = { id: 2000, data: { fullName: 'New User', email: 'new@test.com', summary: 'New summary', education: [], experience: [], skills: ['NewSkill'] }, notes: 'New version', timestamp: new Date().toISOString() };
      await chrome.storage.local.set({ resumeVersions: [v2, v1], currentResume: v2.data });
    });

    await page.locator('.tab-btn[data-tab="versions"]').click();
    await expect(page.locator('.version-item')).toHaveCount(2);

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('.restore-version[data-version-id="1000"]').click();

    await expect(page.locator('.tab-btn[data-tab="resume"]')).toHaveClass(/active/);
    await expect(page.locator('#fullName')).toHaveValue('Old User');
    await expect(page.locator('#email')).toHaveValue('old@test.com');
    await expect(page.locator('#skills')).toHaveValue('OldSkill');
    await page.close();
  });

  test('multiple saves create multiple version entries', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    for (let i = 1; i <= 3; i++) {
      await page.fill('#fullName', `User ${i}`);
      await page.fill('#email', `user${i}@test.com`);
      await page.locator('#saveResume').click();
      await expect(page.locator('#saveStatus')).toContainText('saved');
    }

    await page.locator('.tab-btn[data-tab="versions"]').click();
    await expect(page.locator('.version-item')).toHaveCount(3);
    await page.close();
  });
});
