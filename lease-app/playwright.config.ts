import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL:'http://127.0.0.1:4176',trace:'retain-on-failure' },
  webServer: { command:'npm run dev -- --host 127.0.0.1 --port 4176',url:'http://127.0.0.1:4176/lease/e2e/mock.html',reuseExistingServer:true,timeout:30_000 },
  projects: [{ name:'chromium',use:{...devices['Desktop Chrome']} }],
});
