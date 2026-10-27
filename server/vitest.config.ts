import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        setupFiles: ['test/setupEnv.ts'],
        // The suites share one database and reset it between tests.
        fileParallelism: false,
        testTimeout: 20_000,
        hookTimeout: 30_000,
    },
});
