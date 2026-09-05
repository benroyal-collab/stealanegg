import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * This environment ships a Chromium build that predates the one this
 * Playwright version would download, and there is no outbound access to fetch
 * a matching one. Point at the local binary when it exists; fall back to
 * Playwright's own resolution everywhere else (CI, a dev machine).
 */
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    video: 'off',
    launchOptions: {
      ...(executablePath === undefined ? {} : { executablePath }),
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
