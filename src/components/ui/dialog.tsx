import { useEffect, useId, useRef, type PropsWithChildren } from 'react'
import { X } from 'lucide-react'
import { Button } from './button'

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
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('aria-hidden'))
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
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
    ;(focusable()[0] ?? panel.current)?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus.current?.focus()
    }
  }, [open, onClose])

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
