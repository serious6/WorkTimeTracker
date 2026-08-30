import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Node's experimental Web Storage globals shadow the ones jsdom provides and
 * warn ("localStorage is not available because --localstorage-file was not
 * provided") as soon as Vitest sets up the test environment. Turning the
 * feature off in the forked workers keeps jsdom's storage and the output clean.
 */
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--no-experimental-webstorage']
  .filter(Boolean)
  .join(' ')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        // Bootstrapping and declarations without behaviour of their own.
        'src/main.tsx',
        'src/db/schema.ts',
        'src/features/storage/repository.ts',
      ],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
})
