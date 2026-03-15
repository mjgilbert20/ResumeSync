const { test, expect } = require('@playwright/test');
const { sampleResume, launchExtension, openPopup, clearStorage } = require('./helpers');

let context, extensionId;

test.beforeAll(async () => { ({ context, extensionId } = await launchExtension()); });
test.afterAll(async () => { await context.close(); });

test.describe('Save and Load resume', () => {
  test('saving writes correct data to chrome.storage', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    await page.fill('#fullName', sampleResume.fullName);
    await page.fill('#email', sampleResume.email);
    await page.fill('#summary', sampleResume.summary);
    await page.fill('#skills', sampleResume.skills.join(', '));

    await page.locator('#addEdu').click();
    const eduCard = page.locator('#eduList .entry-card').first();
    await eduCard.locator('[data-key="school"]').fill(sampleResume.education[0].school);
    await eduCard.locator('[data-key="degree"]').fill(sampleResume.education[0].degree);
    await eduCard.locator('[data-key="year"]').fill(sampleResume.education[0].year);
    await eduCard.locator('[data-key="notes"]').fill(sampleResume.education[0].notes);

    await page.locator('#addExp').click();
    const expCard = page.locator('#expList .entry-card').first();
    await expCard.locator('[data-key="company"]').fill(sampleResume.experience[0].company);
    await expCard.locator('[data-key="title"]').fill(sampleResume.experience[0].title);
    await expCard.locator('[data-key="duration"]').fill(sampleResume.experience[0].duration);
    await expCard.locator('[data-key="description"]').fill(sampleResume.experience[0].description);

    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    const stored = await page.evaluate(async () => {
      const { currentResume } = await chrome.storage.local.get('currentResume');
      return currentResume;
    });

    expect(stored.fullName).toBe(sampleResume.fullName);
    expect(stored.email).toBe(sampleResume.email);
    expect(stored.summary).toBe(sampleResume.summary);
    expect(stored.skills).toEqual(sampleResume.skills);
    expect(stored.education[0].school).toBe(sampleResume.education[0].school);
    expect(stored.education[0].degree).toBe(sampleResume.education[0].degree);
    expect(stored.experience[0].company).toBe(sampleResume.experience[0].company);
    expect(stored.experience[0].title).toBe(sampleResume.experience[0].title);
    await page.close();
  });

  test('save requires name and email (validation)', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);
    await page.fill('#fullName', '');
    await page.fill('#email', '');
    await page.fill('#summary', '');
    await page.fill('#skills', '');
    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('Name and Email');
    await page.close();
  });

  test('loading populates all form fields correctly', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    await page.evaluate(async (sample) => {
      await chrome.storage.local.set({ currentResume: sample });
    }, sampleResume);

    await page.locator('#loadResume').click();
    await expect(page.locator('#saveStatus')).toContainText('loaded');

    await expect(page.locator('#fullName')).toHaveValue(sampleResume.fullName);
    await expect(page.locator('#email')).toHaveValue(sampleResume.email);
    await expect(page.locator('#summary')).toHaveValue(sampleResume.summary);
    await expect(page.locator('#skills')).toHaveValue(sampleResume.skills.join(', '));

    const eduCard = page.locator('#eduList .entry-card').first();
    await expect(eduCard.locator('[data-key="school"]')).toHaveValue(sampleResume.education[0].school);
    await expect(eduCard.locator('[data-key="degree"]')).toHaveValue(sampleResume.education[0].degree);

    const expCard = page.locator('#expList .entry-card').first();
    await expect(expCard.locator('[data-key="company"]')).toHaveValue(sampleResume.experience[0].company);
    await expect(expCard.locator('[data-key="title"]')).toHaveValue(sampleResume.experience[0].title);
    await page.close();
  });

  test('load shows message when no resume is saved', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);
    await page.locator('#loadResume').click();
    await expect(page.locator('#saveStatus')).toContainText('No saved resume');
    await page.close();
  });
});

test.describe('Storage: version cap and size', () => {
  test('version history is capped at 20 entries', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    await page.evaluate(async (sample) => {
      const versions = [];
      for (let i = 0; i < 22; i++) {
        versions.push({ id: Date.now() + i, data: { ...sample, fullName: `User ${i}` }, notes: `Version ${i}`, timestamp: new Date().toISOString() });
      }
      await chrome.storage.local.set({ resumeVersions: versions });
    }, sampleResume);

    await page.fill('#fullName', 'Cap Test User');
    await page.fill('#email', 'cap@test.com');
    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    const count = await page.evaluate(async () => {
      const { resumeVersions } = await chrome.storage.local.get('resumeVersions');
      return resumeVersions.length;
    });
    expect(count).toBeLessThanOrEqual(20);
    await page.close();
  });

  test('20 resumes fit well under 5MB in chrome.storage.local', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    await page.evaluate(async (sample) => {
      const versions = [];
      for (let i = 0; i < 20; i++) {
        versions.push({ id: Date.now() + i, data: { ...sample, fullName: `User ${i}`, summary: 'A'.repeat(500) }, notes: `Version ${i}`, timestamp: new Date().toISOString() });
      }
      await chrome.storage.local.set({ currentResume: sample, resumeVersions: versions });
    }, sampleResume);

    const bytesUsed = await page.evaluate(() => new Promise((resolve) => chrome.storage.local.getBytesInUse(null, resolve)));
    expect(bytesUsed).toBeLessThan(5 * 1024 * 1024);
    await page.close();
  });
});
