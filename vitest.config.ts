import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    testTimeout: 20_000,
    setupFiles: ['test/setup-env.ts'],
    passWithNoTests: true,
  },
})
