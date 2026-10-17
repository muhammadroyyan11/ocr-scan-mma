import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: false,
    workers: 1,
    timeout: 120000,
    reporter: 'list',
    use: {
        baseURL: process.env.TEST_BASE_URL || 'http://localhost:8092',
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'] },
    },
});
