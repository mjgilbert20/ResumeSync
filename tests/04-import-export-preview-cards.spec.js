const { test, expect } = require('@playwright/test');
const { sampleResume, launchExtension, openPopup, clearStorage } = require('./helpers');

let context, extensionId;

test.beforeAll(async () => { ({ context, extensionId } = await launchExtension()); });
test.afterAll(async () => { await context.close(); });

test.describe('Import and Export JSON', () => {
  test('importing a .json file populates form fields', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    const jsonContent = JSON.stringify(sampleResume);
    await page.evaluate(async (json) => {
      const file = new File([json], 'resume.json', { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('resumeFileInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, jsonContent);

    await expect(page.locator('#importStatus')).toContainText('Imported');
    await expect(page.locator('#fullName')).toHaveValue(sampleResume.fullName);
    await expect(page.locator('#email')).toHaveValue(sampleResume.email);
    await expect(page.locator('#summary')).toHaveValue(sampleResume.summary);
    await expect(page.locator('#skills')).toHaveValue(sampleResume.skills.join(', '));
    await expect(page.locator('#eduList .entry-card')).toHaveCount(1);
    await expect(page.locator('#expList .entry-card')).toHaveCount(1);
    await page.close();
  });

  test('export fails gracefully when no resume is saved', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);
    await page.locator('#exportResumeBtn').click();
    await expect(page.locator('#importStatus')).toContainText('No saved resume');
    await page.close();
  });
});

test.describe('Resume Preview', () => {
  test('preview updates with resume data after save', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    await page.fill('#fullName', 'Preview User');
    await page.fill('#email', 'preview@test.com');
    await page.fill('#summary', 'A great engineer');
    await page.fill('#skills', 'TypeScript, Go');
    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    await page.locator('.tab-btn[data-tab="resumePreview"]').click();
    const preview = page.locator('#formattedResume');
    await expect(preview).toContainText('Preview User');
    await expect(preview).toContainText('preview@test.com');
    await expect(preview).toContainText('A great engineer');
    await expect(preview).toContainText('TypeScript');
    await expect(preview).toContainText('Go');
    await page.close();
  });
});

test.describe('Education and Experience cards', () => {
  test('can add multiple education cards', async () => {
    const page = await openPopup(context, extensionId);
    await page.locator('#addEdu').click();
    await page.locator('#addEdu').click();
    await page.locator('#addEdu').click();
    await expect(page.locator('#eduList .entry-card')).toHaveCount(3);
    await page.close();
  });

  test('can add multiple experience cards', async () => {
    const page = await openPopup(context, extensionId);
    await page.locator('#addExp').click();
    await page.locator('#addExp').click();
    await expect(page.locator('#expList .entry-card')).toHaveCount(2);
    await page.close();
  });

  test('deleting a card removes it from the DOM', async () => {
    const page = await openPopup(context, extensionId);
    await page.locator('#addEdu').click();
    await page.locator('#addEdu').click();
    await expect(page.locator('#eduList .entry-card')).toHaveCount(2);
    await page.locator('#eduList .card-delete-btn').first().click();
    await expect(page.locator('#eduList .entry-card')).toHaveCount(1);
    await page.close();
  });

  test('empty cards are filtered out on save', async () => {
    const page = await openPopup(context, extensionId);
    await clearStorage(page);

    await page.fill('#fullName', 'Card Filter Test');
    await page.fill('#email', 'filter@test.com');
    await page.locator('#addEdu').click();
    await page.locator('#addExp').click();
    await page.locator('#expList .entry-card [data-key="company"]').fill('Real Corp');

    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    const stored = await page.evaluate(async () => {
      const { currentResume } = await chrome.storage.local.get('currentResume');
      return currentResume;
    });

    expect(stored.education.length).toBe(0);
    expect(stored.experience.length).toBe(1);
    expect(stored.experience[0].company).toBe('Real Corp');
    await page.close();
  });
});
