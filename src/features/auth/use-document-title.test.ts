import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { useDocumentTitle } from './use-document-title'

const originalTitle = document.title

afterEach(() => {
  document.title = originalTitle
})

describe('useDocumentTitle', () => {
  test('sets the title while mounted and restores it afterwards', () => {
    document.title = 'WorkTimeTracker'
    const { unmount } = renderHook(() => useDocumentTitle('WorkTimeTracker — Sign in'))
    expect(document.title).toBe('WorkTimeTracker — Sign in')

    unmount()
    expect(document.title).toBe('WorkTimeTracker')
  })

  test('follows a changed title', () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: 'WorkTimeTracker — Sign in' },
    })
    rerender({ title: 'WorkTimeTracker — Create account' })
    expect(document.title).toBe('WorkTimeTracker — Create account')
  })
})
