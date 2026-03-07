const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const extensionPath = path.resolve(__dirname, '..');

let context;
let extensionId;

// Sample resume data used across tests
const sampleResume = {
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  summary: 'Experienced software engineer with 5 years in web development.',
  education: [{ school: 'MIT', degree: 'B.S. Computer Science', year: '2014 - 2018', notes: 'Magna Cum Laude' }],
  experience: [{ company: 'Acme Corp', title: 'Software Engineer', duration: '2021 - Present', description: 'Built scalable APIs' }],
  skills: ['JavaScript', 'Python', 'React'],
};

/** Open a fresh popup page */
async function openPopup() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/** Clear all extension storage before a test */
async function clearStorage(page) {
  await page.evaluate(() => chrome.storage.local.clear());
}

// ─── Setup & Teardown ──────────────────────────────────────────────────────

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  extensionId = sw.url().split('/')[2];
});

test.afterAll(async () => {
  await context.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// UI INTERACTION TESTS — buttons should respond within 200ms
// ═══════════════════════════════════════════════════════════════════════════

test.describe('UI responsiveness (<200ms)', () => {

  test('tab switching responds within 200ms', async () => {
    const page = await openPopup();

    for (const tabName of ['versions', 'compare', 'resumePreview', 'resume']) {
      // Measure inside the browser to avoid Playwright IPC overhead
      const elapsed = await page.evaluate((tab) => {
        const start = performance.now();
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).click();
        const end = performance.now();
        return end - start;
      }, tabName);
      expect(elapsed).toBeLessThan(200);
      await expect(page.locator(`#${tabName}-tab`)).toHaveClass(/active/);
    }

    await page.close();
  });

  test('Add Education button responds within 200ms', async () => {
    const page = await openPopup();

    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      document.getElementById('addEdu').click();
      const end = performance.now();
      return end - start;
    });
    expect(elapsed).toBeLessThan(200);
    await expect(page.locator('#eduList .entry-card')).toHaveCount(1);

    await page.close();
  });

  test('Add Experience button responds within 200ms', async () => {
    const page = await openPopup();

    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      document.getElementById('addExp').click();
      const end = performance.now();
      return end - start;
    });
    expect(elapsed).toBeLessThan(200);
    await expect(page.locator('#expList .entry-card')).toHaveCount(1);

    await page.close();
  });

  test('card delete button responds within 200ms', async () => {
    const page = await openPopup();
    await page.locator('#addEdu').click();
    await expect(page.locator('#eduList .entry-card')).toHaveCount(1);

    const elapsed = await page.evaluate(() => {
      const start = performance.now();
      document.querySelector('#eduList .card-delete-btn').click();
      const end = performance.now();
      return end - start;
    });
    expect(elapsed).toBeLessThan(200);
    await expect(page.locator('#eduList .entry-card')).toHaveCount(0);

    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE TESTS — up to 20 versions, <5MB
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Storage: version cap and size', () => {

  test('version history is capped at 20 entries', async () => {
    const page = await openPopup();
    await clearStorage(page);

    // Create 22 versions directly via storage API to test the cap logic
    await page.evaluate(async (sample) => {
      const versions = [];
      for (let i = 0; i < 22; i++) {
        versions.push({
          id: Date.now() + i,
          data: { ...sample, fullName: `User ${i}` },
          notes: `Version ${i}`,
          timestamp: new Date().toISOString(),
        });
      }
      await chrome.storage.local.set({ resumeVersions: versions });
    }, sampleResume);

    // Now save one more via the UI which runs createVersion (caps at 20)
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
    const page = await openPopup();
    await clearStorage(page);

    // Fill storage with 20 realistic versions
    await page.evaluate(async (sample) => {
      const versions = [];
      for (let i = 0; i < 20; i++) {
        versions.push({
          id: Date.now() + i,
          data: {
            ...sample,
            fullName: `User ${i}`,
            summary: 'A'.repeat(500), // realistic summary length
          },
          notes: `Version ${i}`,
          timestamp: new Date().toISOString(),
        });
      }
      await chrome.storage.local.set({
        currentResume: sample,
        resumeVersions: versions,
      });
    }, sampleResume);

    const bytesUsed = await page.evaluate(() => {
      return new Promise((resolve) => chrome.storage.local.getBytesInUse(null, resolve));
    });

    const fiveMB = 5 * 1024 * 1024;
    expect(bytesUsed).toBeLessThan(fiveMB);

    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAVE & LOAD — verify correct data round-trips through storage
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Save and Load resume', () => {

  test('saving writes correct data to chrome.storage', async () => {
    const page = await openPopup();
    await clearStorage(page);

    // Fill in the form
    await page.fill('#fullName', sampleResume.fullName);
    await page.fill('#email', sampleResume.email);
    await page.fill('#summary', sampleResume.summary);
    await page.fill('#skills', sampleResume.skills.join(', '));

    // Add education card and fill it
    await page.locator('#addEdu').click();
    const eduCard = page.locator('#eduList .entry-card').first();
    await eduCard.locator('[data-key="school"]').fill(sampleResume.education[0].school);
    await eduCard.locator('[data-key="degree"]').fill(sampleResume.education[0].degree);
    await eduCard.locator('[data-key="year"]').fill(sampleResume.education[0].year);
    await eduCard.locator('[data-key="notes"]').fill(sampleResume.education[0].notes);

    // Add experience card and fill it
    await page.locator('#addExp').click();
    const expCard = page.locator('#expList .entry-card').first();
    await expCard.locator('[data-key="company"]').fill(sampleResume.experience[0].company);
    await expCard.locator('[data-key="title"]').fill(sampleResume.experience[0].title);
    await expCard.locator('[data-key="duration"]').fill(sampleResume.experience[0].duration);
    await expCard.locator('[data-key="description"]').fill(sampleResume.experience[0].description);

    // Save
    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    // Verify what was written to storage
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
    const page = await openPopup();
    await clearStorage(page);

    // Clear the form fields (auto-load may have populated them)
    await page.fill('#fullName', '');
    await page.fill('#email', '');
    await page.fill('#summary', '');
    await page.fill('#skills', '');

    // Try saving with empty fields
    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('Name and Email');

    await page.close();
  });

  test('loading populates all form fields correctly', async () => {
    const page = await openPopup();
    await clearStorage(page);

    // Seed storage directly
    await page.evaluate(async (sample) => {
      await chrome.storage.local.set({ currentResume: sample });
    }, sampleResume);

    // Click Load
    await page.locator('#loadResume').click();
    await expect(page.locator('#saveStatus')).toContainText('loaded');

    // Verify form fields
    await expect(page.locator('#fullName')).toHaveValue(sampleResume.fullName);
    await expect(page.locator('#email')).toHaveValue(sampleResume.email);
    await expect(page.locator('#summary')).toHaveValue(sampleResume.summary);
    await expect(page.locator('#skills')).toHaveValue(sampleResume.skills.join(', '));

    // Verify education card was populated
    const eduCard = page.locator('#eduList .entry-card').first();
    await expect(eduCard.locator('[data-key="school"]')).toHaveValue(sampleResume.education[0].school);
    await expect(eduCard.locator('[data-key="degree"]')).toHaveValue(sampleResume.education[0].degree);

    // Verify experience card was populated
    const expCard = page.locator('#expList .entry-card').first();
    await expect(expCard.locator('[data-key="company"]')).toHaveValue(sampleResume.experience[0].company);
    await expect(expCard.locator('[data-key="title"]')).toHaveValue(sampleResume.experience[0].title);

    await page.close();
  });

  test('load shows message when no resume is saved', async () => {
    const page = await openPopup();
    await clearStorage(page);

    await page.locator('#loadResume').click();
    await expect(page.locator('#saveStatus')).toContainText('No saved resume');

    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VERSION HISTORY — save creates version, versions display, restore works
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Version History', () => {

  test('saving a resume creates a version entry', async () => {
    const page = await openPopup();
    await clearStorage(page);

    await page.fill('#fullName', 'Version Test');
    await page.fill('#email', 'v@test.com');
    await page.fill('#versionNotes', 'My first save');
    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    // Switch to Versions tab (click twice — first click may race with the async save)
    await page.locator('.tab-btn[data-tab="versions"]').click();
    // Small wait for storage write to complete, then re-trigger loadVersionHistory
    await page.waitForTimeout(300);
    await page.locator('.tab-btn[data-tab="resume"]').click();
    await page.locator('.tab-btn[data-tab="versions"]').click();

    // Should see exactly 1 version
    await expect(page.locator('.version-item')).toHaveCount(1);
    await expect(page.locator('.version-notes')).toContainText('My first save');
    await expect(page.locator('.version-summary')).toContainText('Version Test');

    await page.close();
  });

  test('empty version history shows placeholder', async () => {
    const page = await openPopup();
    await clearStorage(page);

    await page.locator('.tab-btn[data-tab="versions"]').click();
    await expect(page.locator('.empty-state')).toContainText('No versions saved yet');

    await page.close();
  });

  test('restoring a version populates the form and switches to Resume tab', async () => {
    const page = await openPopup();
    await clearStorage(page);

    // Seed two versions in storage
    await page.evaluate(async () => {
      const v1 = {
        id: 1000,
        data: { fullName: 'Old User', email: 'old@test.com', summary: 'Old summary', education: [], experience: [], skills: ['OldSkill'] },
        notes: 'Old version',
        timestamp: new Date().toISOString(),
      };
      const v2 = {
        id: 2000,
        data: { fullName: 'New User', email: 'new@test.com', summary: 'New summary', education: [], experience: [], skills: ['NewSkill'] },
        notes: 'New version',
        timestamp: new Date().toISOString(),
      };
      await chrome.storage.local.set({ resumeVersions: [v2, v1], currentResume: v2.data });
    });

    // Go to Versions tab
    await page.locator('.tab-btn[data-tab="versions"]').click();
    await expect(page.locator('.version-item')).toHaveCount(2);

    // Dismiss the alert that restoreVersion triggers
    page.on('dialog', (dialog) => dialog.accept());

    // Restore the older version (second item)
    await page.locator('.restore-version[data-version-id="1000"]').click();

    // Should switch to Resume tab with old data
    await expect(page.locator('.tab-btn[data-tab="resume"]')).toHaveClass(/active/);
    await expect(page.locator('#fullName')).toHaveValue('Old User');
    await expect(page.locator('#email')).toHaveValue('old@test.com');
    await expect(page.locator('#skills')).toHaveValue('OldSkill');

    await page.close();
  });

  test('multiple saves create multiple version entries', async () => {
    const page = await openPopup();
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

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT / EXPORT — JSON import populates fields, export requires saved data
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Import and Export JSON', () => {

  test('importing a .json file populates form fields', async () => {
    const page = await openPopup();
    await clearStorage(page);

    const jsonContent = JSON.stringify(sampleResume);

    // Use the hidden file input directly with a synthetic file
    await page.evaluate(async (json) => {
      const file = new File([json], 'resume.json', { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('resumeFileInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, jsonContent);

    // Wait for import status
    await expect(page.locator('#importStatus')).toContainText('Imported');

    // Verify fields were populated
    await expect(page.locator('#fullName')).toHaveValue(sampleResume.fullName);
    await expect(page.locator('#email')).toHaveValue(sampleResume.email);
    await expect(page.locator('#summary')).toHaveValue(sampleResume.summary);
    await expect(page.locator('#skills')).toHaveValue(sampleResume.skills.join(', '));
    await expect(page.locator('#eduList .entry-card')).toHaveCount(1);
    await expect(page.locator('#expList .entry-card')).toHaveCount(1);

    await page.close();
  });

  test('export fails gracefully when no resume is saved', async () => {
    const page = await openPopup();
    await clearStorage(page);

    await page.locator('#exportResumeBtn').click();
    await expect(page.locator('#importStatus')).toContainText('No saved resume');

    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW TAB — formatted resume renders after save
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Resume Preview', () => {

  test('preview updates with resume data after save', async () => {
    const page = await openPopup();
    await clearStorage(page);

    await page.fill('#fullName', 'Preview User');
    await page.fill('#email', 'preview@test.com');
    await page.fill('#summary', 'A great engineer');
    await page.fill('#skills', 'TypeScript, Go');
    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    // Switch to Preview tab
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

// ═══════════════════════════════════════════════════════════════════════════
// CARD SYSTEM — add/remove education & experience cards
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Education and Experience cards', () => {

  test('can add multiple education cards', async () => {
    const page = await openPopup();

    await page.locator('#addEdu').click();
    await page.locator('#addEdu').click();
    await page.locator('#addEdu').click();
    await expect(page.locator('#eduList .entry-card')).toHaveCount(3);

    await page.close();
  });

  test('can add multiple experience cards', async () => {
    const page = await openPopup();

    await page.locator('#addExp').click();
    await page.locator('#addExp').click();
    await expect(page.locator('#expList .entry-card')).toHaveCount(2);

    await page.close();
  });

  test('deleting a card removes it from the DOM', async () => {
    const page = await openPopup();

    await page.locator('#addEdu').click();
    await page.locator('#addEdu').click();
    await expect(page.locator('#eduList .entry-card')).toHaveCount(2);

    await page.locator('#eduList .card-delete-btn').first().click();
    await expect(page.locator('#eduList .entry-card')).toHaveCount(1);

    await page.close();
  });

  test('empty cards are filtered out on save', async () => {
    const page = await openPopup();
    await clearStorage(page);

    await page.fill('#fullName', 'Card Filter Test');
    await page.fill('#email', 'filter@test.com');

    // Add an empty education card (should be filtered out)
    await page.locator('#addEdu').click();
    // Add a filled experience card
    await page.locator('#addExp').click();
    await page.locator('#expList .entry-card [data-key="company"]').fill('Real Corp');

    await page.locator('#saveResume').click();
    await expect(page.locator('#saveStatus')).toContainText('saved');

    const stored = await page.evaluate(async () => {
      const { currentResume } = await chrome.storage.local.get('currentResume');
      return currentResume;
    });

    // Empty education card should have been filtered out
    expect(stored.education.length).toBe(0);
    expect(stored.experience.length).toBe(1);
    expect(stored.experience[0].company).toBe('Real Corp');

    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POPUP BASICS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Popup basics', () => {

  test('popup loads with correct title', async () => {
    const page = await openPopup();
    await expect(page).toHaveTitle('ResumeSync');
    await page.close();
  });

  test('all four tabs are visible', async () => {
    const page = await openPopup();
    const tabs = page.locator('.tab-btn');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('Resume');
    await expect(tabs.nth(1)).toHaveText('Preview');
    await expect(tabs.nth(2)).toHaveText('Versions');
    await expect(tabs.nth(3)).toHaveText('Compare');
    await page.close();
  });

  test('resume tab is active by default', async () => {
    const page = await openPopup();
    await expect(page.locator('.tab-btn.active')).toHaveText('Resume');
    await expect(page.locator('#resume-tab')).toHaveClass(/active/);
    await page.close();
  });

  test('all form fields are present in the Resume tab', async () => {
    const page = await openPopup();
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
