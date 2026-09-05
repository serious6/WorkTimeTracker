import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import fc from 'fast-check'
import { afterEach } from 'vitest'

/**
 * The property based tests (`*.property.test.ts`) explore generated input, so
 * they get a fixed seed: a failure reproduces from the report instead of only
 * on the machine that saw it. Broad, unseeded exploration of the same code is
 * the job of the fuzz targets in `src-tauri/fuzz`.
 */
fc.configureGlobal({ seed: 20_260_827, numRuns: 500 })

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
 * jsdom lays nothing out, so every element measures 0x0 and the responsive
 * charts refuse to draw with a warning on stderr. A fixed size lets them
 * render; no test asserts on these numbers.
 */
const LAYOUT_WIDTH = 400
const LAYOUT_HEIGHT = 400

if (typeof HTMLElement !== 'undefined') {
  for (const [property, value] of [
    ['offsetWidth', LAYOUT_WIDTH],
    ['offsetHeight', LAYOUT_HEIGHT],
    ['clientWidth', LAYOUT_WIDTH],
    ['clientHeight', LAYOUT_HEIGHT],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get() {
        return value
      },
    })
  }

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: LAYOUT_WIDTH,
      bottom: LAYOUT_HEIGHT,
      width: LAYOUT_WIDTH,
      height: LAYOUT_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect
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
