import { afterEach, expect, test, vi } from 'vitest'

const { loadApp, report, failed } = vi.hoisted(() => ({
  loadApp: vi.fn(),
  report: vi.fn(),
  failed: vi.fn(),
}))

vi.mock('./boot-status', () => {
  window.requestAnimationFrame(() => window.setTimeout(report, 0))
  return { bootFailed: failed }
})
vi.mock('./main.tsx', () => {
  loadApp()
  return {}
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('loads the application only after the first frame and its loading-page report', async () => {
  vi.useFakeTimers()
  const frames: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame))

  await import('./bootstrap')
  expect(loadApp).not.toHaveBeenCalled()
  expect(report).not.toHaveBeenCalled()

  frames.forEach((frame) => frame(0))
  expect(loadApp).not.toHaveBeenCalled()
  expect(report).not.toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(0)
  await vi.dynamicImportSettled()
  expect(report).toHaveBeenCalledOnce()
  expect(loadApp).toHaveBeenCalledOnce()
  expect(report.mock.invocationCallOrder[0]).toBeLessThan(loadApp.mock.invocationCallOrder[0] ?? 0)
  expect(failed).not.toHaveBeenCalled()
})
