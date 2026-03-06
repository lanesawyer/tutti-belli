import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    process.env.CI ? ['github'] : ['list'],
  ],
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium-admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-user',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testMatch: /.*permissions\.spec\.ts/,
    },
    ...(process.env.CI
      ? []
      : [
          {
            name: 'firefox-admin',
            use: {
              ...devices['Desktop Firefox'],
              storageState: 'tests/e2e/.auth/admin.json',
            },
            dependencies: ['setup'],
          },
          {
            name: 'firefox-user',
            use: {
              ...devices['Desktop Firefox'],
              storageState: 'tests/e2e/.auth/user.json',
            },
            dependencies: ['setup'],
            testMatch: /.*permissions\.spec\.ts/,
          },
        ]),
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:4321',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 60_000,
    env: {
      EMAIL_DISABLED: 'true',
      STORAGE_DISABLED: 'true',
      STORAGE_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
      STORAGE_BUCKET: 'test-bucket',
      STORAGE_KEY_ID: 'test-key-id',
      STORAGE_KEY: 'test-key',
    },
  },
});
