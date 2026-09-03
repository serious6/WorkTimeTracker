import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/**
 * The dev server exposes the whole UI, so it stays on the loopback interface. Testing on a
 * physical device is the deliberate exception: the Tauri CLI sets `TAURI_DEV_HOST` for
 * `tauri android dev --host`, and it can be set by hand for `npm run dev`.
 */
export function resolveDevServerHost(env: Record<string, string | undefined>): string {
  const host = env.TAURI_DEV_HOST?.trim()
  return host ? host : '127.0.0.1'
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    host: resolveDevServerHost(process.env),
    port: 1420,
    strictPort: true,
  },
})
