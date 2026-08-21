import { defineConfig, devices } from '@playwright/test'

const localBaseURL = 'http://127.0.0.1:4173'
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? localBaseURL

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_TEST_BASE_URL
    ? undefined
    : {
        command: 'node .output/server/index.mjs',
        env: {
          HOST: '0.0.0.0',
          NODE_ENV: 'production',
          PORT: '4173',
        },
        url: `${localBaseURL}/health`,
        reuseExistingServer: false,
        timeout: 30_000,
        stdout: 'pipe',
        stderr: 'pipe',
        gracefulShutdown: {
          signal: 'SIGTERM',
          timeout: 5_000,
        },
      },
})
