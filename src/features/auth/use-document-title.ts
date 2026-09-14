import { useEffect } from 'react'

/**
 * Sets the document (and therefore window) title while a screen is mounted and
 * restores the previous one afterwards. Password managers derive the name of a
 * saved item from the title, so the sign-in screens name themselves explicitly
 * instead of relying on the generic application title.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
