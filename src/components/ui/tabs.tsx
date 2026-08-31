import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type TabsContextValue = {
  value: string
  setValue: (value: string) => void
  baseId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext)
  if (!context) throw new Error(`${component} must be used inside <Tabs>`)
  return context
}

/** A minimal, uncontrolled-by-default tabs primitive following the `role="tablist"` pattern. */
export function Tabs({
  defaultValue,
  value,
  onValueChange,
  className,
  children,
}: {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  className?: string
  children: ReactNode
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? '')
  const baseId = useId()
  const current = value ?? uncontrolled
  const setValue = (next: string) => {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }
  return (
    <TabsContext.Provider value={{ value: current, setValue, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1',
        className,
      )}
      role="tablist"
    >
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: ReactNode
}) {
  const { value: active, setValue, baseId } = useTabsContext('TabsTrigger')
  const selected = active === value
  return (
    <button
      aria-controls={`${baseId}-panel-${value}`}
      aria-selected={selected}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      id={`${baseId}-tab-${value}`}
      onClick={() => setValue(value)}
      role="tab"
      type="button"
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: ReactNode
}) {
  const { value: active, baseId } = useTabsContext('TabsContent')
  if (active !== value) return null
  return (
    <div
      aria-labelledby={`${baseId}-tab-${value}`}
      className={className}
      id={`${baseId}-panel-${value}`}
      role="tabpanel"
    >
      {children}
    </div>
  )
}
