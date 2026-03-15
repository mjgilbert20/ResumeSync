const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    headless: false,
  },
  testMatch: /\d+-.*\.spec\.js$/,
});
