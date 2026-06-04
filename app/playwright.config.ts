import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/time/',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/time/',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_TIME_CLOCK_DATA_SOURCE: 'mock',
      VITE_TIME_CLOCK_STRESS_DATA: 'true',
      VITE_APP_ENV: 'test',
      VITE_APP_BASE_PATH: '/time/',
    },
  },
  projects: [
    {
      name: 'small-phone',
      use: { ...devices['iPhone SE'], browserName: 'chromium', isMobile: true },
    },
    {
      name: 'large-phone',
      use: { browserName: 'chromium', viewport: { width: 430, height: 932 }, isMobile: true },
    },
    {
      name: 'tablet',
      use: { browserName: 'chromium', viewport: { width: 820, height: 1180 }, isMobile: true },
    },
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } },
    },
  ],
});
