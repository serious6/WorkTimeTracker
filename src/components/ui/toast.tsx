import { useEffect } from 'react'
import { useToastStore } from './toast-store'

const DISMISS_AFTER_MS = 4_000

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  useEffect(() => {
    const timers = toasts.map((item) => setTimeout(() => dismiss(item.id), DISMISS_AFTER_MS))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((item) => (
        <div
          className={`pointer-events-auto rounded-md border bg-card p-3 shadow-lg ${
            item.variant === 'destructive' ? 'border-destructive/60' : 'border-border'
          }`}
          key={item.id}
          role="status"
        >
          <p className="text-sm font-medium">{item.title}</p>
          {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
        </div>
      ))}
    </div>
  )
}
