import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, String(value))
    },
    removeItem: (key) => {
      entries.delete(key)
    },
    clear: () => {
      entries.clear()
    },
  }
}

/** jsdom ships no ResizeObserver, which the chart components observe with. */
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/**
 * Node 26 owns storage globals that stay undefined without CLI storage files
 * and hide the ones jsdom provides.
 */
if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() })
}

if (!globalThis.sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memoryStorage() })
}
