import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProjects } from '../project-queries'
import { DELETED_PROJECT_NAME } from '@/features/time-entries/time-entry-schema'

export function ProjectPicker({
  value,
  open,
  onOpenChange,
  onSelect,
  onCreate,
}: {
  value: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (projectId: number) => void
  onCreate: () => void
}) {
  const { data: projects = [] } = useProjects()
  const [search, setSearch] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  const container = useRef<HTMLDivElement>(null)
  const openChangeRef = useRef(onOpenChange)
  openChangeRef.current = onOpenChange
  const selected = projects.find((project) => project.id === value)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSearch('')
  }

  useEffect(() => {
    if (!open) return
    container.current?.querySelector<HTMLInputElement>('input')?.focus()
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) openChangeRef.current(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') openChangeRef.current(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const matches = projects.filter(
    (project) => project.active && project.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <div className="relative w-full sm:w-72" ref={container}>
      <Button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpenChange(!open)}
        variant="outline"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected && (
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
          )}
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected?.name ?? (value ? DELETED_PROJECT_NAME : 'Select a project')}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search projects"
              className="border-0 pl-9 focus-visible:ring-0"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects"
              value={search}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1" role="listbox">
            {matches.map((project) => (
              <Button
                aria-selected={project.id === value}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                key={project.id}
                onClick={() => {
                  onSelect(project.id)
                  onOpenChange(false)
                }}
                role="option"
                variant="ghost"
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                {project.name}
              </Button>
            ))}
            {matches.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No projects found</p>
            )}
          </div>
          <Button
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-primary outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
            onClick={() => {
              onOpenChange(false)
              onCreate()
            }}
            variant="ghost"
          >
            <Plus className="size-4" />
            Create project
          </Button>
        </div>
      )}
    </div>
  )
}
