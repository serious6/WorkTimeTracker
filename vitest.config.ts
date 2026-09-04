import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// `.tsx` tests render React and stay in jsdom by glob. Keep `.ts` tests here
// only when they use DOM/browser events or Testing Library renderHook.
const jsdomTestFiles = [
  'src/lib/global-errors.test.ts',
  'src/features/auth/session-queries.test.ts',
  'src/features/storage/tauri-repository.test.ts',
  'src/features/dashboard/use-keyboard-shortcuts.test.ts',
  'src/features/timer/use-ticker.test.ts',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    pool: 'threads',
    setupFiles: ['./src/test/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
          exclude: [...configDefaults.exclude, ...jsdomTestFiles],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx', ...jsdomTestFiles],
        },
      },
    ],
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
