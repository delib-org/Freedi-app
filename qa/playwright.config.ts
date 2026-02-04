import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Freedi QA Testing
 *
 * Tests all 3 apps:
 * - Freedi (main app) - localhost:5173
 * - Mass Consensus - localhost:3000
 * - Sign - localhost:3001
 */

export default defineConfig({
  testDir: './tests',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    // ============================================
    // FREEDI MAIN APP TESTS
    // ============================================
    {
      name: 'freedi-chromium',
      testDir: './tests/freedi',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.FREEDI_URL || 'http://localhost:5173',
      },
    },
    {
      name: 'freedi-firefox',
      testDir: './tests/freedi',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: process.env.FREEDI_URL || 'http://localhost:5173',
      },
    },
    {
      name: 'freedi-mobile',
      testDir: './tests/freedi',
      use: {
        ...devices['iPhone 13'],
        baseURL: process.env.FREEDI_URL || 'http://localhost:5173',
      },
    },

    // ============================================
    // MASS CONSENSUS APP TESTS
    // ============================================
    {
      name: 'mass-consensus-chromium',
      testDir: './tests/mass-consensus',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.MC_URL || 'http://localhost:3000',
      },
    },
    {
      name: 'mass-consensus-firefox',
      testDir: './tests/mass-consensus',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: process.env.MC_URL || 'http://localhost:3000',
      },
    },
    {
      name: 'mass-consensus-mobile',
      testDir: './tests/mass-consensus',
      use: {
        ...devices['iPhone 13'],
        baseURL: process.env.MC_URL || 'http://localhost:3000',
      },
    },

    // ============================================
    // SIGN APP TESTS
    // ============================================
    {
      name: 'sign-chromium',
      testDir: './tests/sign',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.SIGN_URL || 'http://localhost:3001',
      },
    },
    {
      name: 'sign-firefox',
      testDir: './tests/sign',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: process.env.SIGN_URL || 'http://localhost:3001',
      },
    },
    {
      name: 'sign-mobile',
      testDir: './tests/sign',
      use: {
        ...devices['iPhone 13'],
        baseURL: process.env.SIGN_URL || 'http://localhost:3001',
      },
    },
  ],

  /* Output folder for test artifacts */
  outputDir: 'test-results/artifacts',

  /* Timeout settings */
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
});
