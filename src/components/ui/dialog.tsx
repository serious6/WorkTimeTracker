import { useEffect, useId, useRef, type PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './button'

let openDialogCount = 0
const dialogPanels: HTMLElement[] = []
let bodyOverflow = ''
let appRoot: HTMLElement | null = null
let appRootUsesInert = false
let appRootAriaHidden: string | null = null

function lockModalEnvironment() {
  if (openDialogCount++ > 0) return

  bodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  appRoot = document.getElementById('root')
  if (!appRoot) return

  appRootUsesInert = 'inert' in appRoot
  if (appRootUsesInert) {
    appRoot.setAttribute('inert', '')
  } else {
    appRootAriaHidden = appRoot.getAttribute('aria-hidden')
    appRoot.setAttribute('aria-hidden', 'true')
  }
}

function unlockModalEnvironment() {
  if (--openDialogCount > 0) return

  openDialogCount = 0
  document.body.style.overflow = bodyOverflow
  if (appRoot) {
    if (appRootUsesInert) {
      appRoot.removeAttribute('inert')
    } else if (appRootAriaHidden === null) {
      appRoot.removeAttribute('aria-hidden')
    } else {
      appRoot.setAttribute('aria-hidden', appRootAriaHidden)
    }
  }
  appRoot = null
}

function isFocusable(element: HTMLElement, root: HTMLElement) {
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
  const backdropMouseDown = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panelEl = panel.current
    if (!panelEl) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lockModalEnvironment()
    dialogPanels.push(panelEl)
    const isTopDialog = () => dialogPanels.at(-1) === panelEl
    const focusable = () =>
      Array.from(
        panelEl.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => isFocusable(element, panelEl))
    const focusInitial = () => {
      const autofocusCandidates = [
        ...panelEl.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
        ),
        ...focusable(),
        panelEl,
      ]
      autofocusCandidates.find((element) => {
        if (!isFocusable(element, panelEl)) return false
        element.focus()
        return document.activeElement === element
      })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog()) return
      if (event.key === 'Escape') closeRef.current()
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) {
        event.preventDefault()
        panelEl.focus()
        return
      }
      const first = elements[0]
      const last = elements.at(-1)
      if (!panelEl.contains(document.activeElement)) {
        event.preventDefault()
        const destination = event.shiftKey ? last : first
        destination?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
    }
    const onFocusIn = (event: FocusEvent) => {
      if (isTopDialog() && (!(event.target instanceof Node) || !panelEl.contains(event.target))) {
        focusInitial()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    if (isTopDialog()) focusInitial()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      dialogPanels.splice(dialogPanels.indexOf(panelEl), 1)
      unlockModalEnvironment()
      previousFocus.current?.focus()
    }
  }, [open])

  if (!open) return null

  const dialog = (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      data-testid="dialog-backdrop"
      onClick={(event) => {
        if (backdropMouseDown.current && event.target === event.currentTarget) closeRef.current()
        backdropMouseDown.current = false
      }}
      onMouseDown={(event) => {
        backdropMouseDown.current = event.target === event.currentTarget
      }}
    >
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

  return createPortal(dialog, document.body)
}
