import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // SwiftShader shares the CPU with all browser contexts. Serial test files
  // avoid GPU contention while retaining real WebGL in every browser check.
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // A synthetic webcam, so the camera tier of AR can be driven for real
        // instead of being the one path nothing exercises.
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  reporter: 'list',
});
