import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export type MenuItem = {
  label: string
  onSelect: () => void
  destructive?: boolean
}

/** Small keyboard accessible dropdown used for the entry context menus. */
export function Menu({ trigger, items, label }: { trigger: ReactNode; items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={container}>
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((current) => !current)}
        size="icon"
        variant="ghost"
      >
        {trigger}
      </Button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg"
          role="menu"
        >
          {items.map((item) => (
            <Button
              className={cn(
                'block w-full px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted',
                item.destructive && 'text-destructive',
              )}
              key={item.label}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              role="menuitem"
              variant="ghost"
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
