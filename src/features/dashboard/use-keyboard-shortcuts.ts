import { useEffect, useRef } from 'react'
import { useDashboardStore } from './dashboard-store'

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    Boolean(target.closest('[role="dialog"]'))
  )
}

/** Dashboard shortcuts: Ctrl/Cmd+N, Ctrl/Cmd+K, T, arrow keys and Space. */
export function useKeyboardShortcuts({
  onAddEntry,
  onProjectSearch,
  onToggleTimer,
}: {
  onAddEntry: () => void
  onProjectSearch: () => void
  onToggleTimer: () => void
}) {
  const shiftSelectedDate = useDashboardStore((state) => state.shiftSelectedDate)
  const goToToday = useDashboardStore((state) => state.goToToday)
  const handlers = useRef({ onAddEntry, onProjectSearch, onToggleTimer })

  useEffect(() => {
    handlers.current = { onAddEntry, onProjectSearch, onToggleTimer }
  }, [onAddEntry, onProjectSearch, onToggleTimer])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handlers.current.onAddEntry()
        return
      }
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        handlers.current.onProjectSearch()
        return
      }
      if (modifier || isTextInput(event.target)) return

      if (event.key === 'ArrowLeft') shiftSelectedDate(-1)
      else if (event.key === 'ArrowRight') shiftSelectedDate(1)
      else if (event.key.toLowerCase() === 't') goToToday()
      else if (event.key === ' ') {
        event.preventDefault()
        handlers.current.onToggleTimer()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [goToToday, shiftSelectedDate])
}
