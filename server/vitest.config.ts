import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test-*.ts',
      ],
    },
    testTimeout: 30000, // 30 seconds for API calls
  },
});
