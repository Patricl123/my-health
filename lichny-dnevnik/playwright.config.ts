import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 45000, expect: { timeout: 15000 }, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    launchOptions: { executablePath: process.env.TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
