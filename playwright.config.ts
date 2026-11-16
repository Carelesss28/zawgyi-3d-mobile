import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /e2e\.spec\.ts/,
  timeout: 240_000,                                   // software WebGL (swiftshader) stalls for seconds compiling effects; give the long tests room
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4174',
    headless: true,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'npm run build && npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174', reuseExistingServer: true, timeout: 120_000 },
});
