const { chromium } = require('@playwright/test');
const path = require('path');

const extensionPath = path.resolve(__dirname, '..');

const sampleResume = {
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  summary: 'Experienced software engineer with 5 years in web development.',
  education: [{ school: 'MIT', degree: 'B.S. Computer Science', year: '2014 - 2018', notes: 'Magna Cum Laude' }],
  experience: [{ company: 'Acme Corp', title: 'Software Engineer', duration: '2021 - Present', description: 'Built scalable APIs' }],
  skills: ['JavaScript', 'Python', 'React'],
};

async function launchExtension() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = sw.url().split('/')[2];
  return { context, extensionId };
}

async function openPopup(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

async function clearStorage(page) {
  await page.evaluate(() => chrome.storage.local.clear());
}

module.exports = { sampleResume, launchExtension, openPopup, clearStorage, extensionPath };
