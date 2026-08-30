import { useEffect, useId, useRef, type PropsWithChildren } from 'react'
import { X } from 'lucide-react'
import { Button } from './button'

function isVisible(element: HTMLElement, root: HTMLElement) {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true' || current.hasAttribute('inert')) {
      return false
    }

    const style = window.getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
      return false
    }

    if (current === root) return true
  }

  return false
}

function tryFocus(element: HTMLElement) {
  element.focus()
  return document.activeElement === element
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean
  title: string
  description?: string
  onClose: () => void
}>) {
  const panel = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => (panel.current ? isVisible(element, panel.current) : false))
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) {
        event.preventDefault()
        panel.current?.focus()
        return
      }
      const first = elements[0]
      const last = elements.at(-1)
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const autofocusCandidates = Array.from(new Set([
      ...Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
        ) ?? [],
      ),
      ...focusable(),
      ...(panel.current ? [panel.current] : []),
    ]))

    for (const element of autofocusCandidates) {
      if ((panel.current && !isVisible(element, panel.current)) || !tryFocus(element)) continue
      break
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-lg"
        ref={panel}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold" id={titleId}>
              {title}
            </h2>
            {description && (
              <p className="text-sm text-muted-foreground" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <Button aria-label="Close dialog" onClick={onClose} size="icon" variant="ghost">
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}
