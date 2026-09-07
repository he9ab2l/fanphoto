import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    baseURL: 'http://127.0.0.1:8791',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm exec tsx tests/start-server.ts',
    url: 'http://127.0.0.1:8791/api/v1/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
