import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useCreateProject, useProjects, useUpdateProject } from '../project-queries'
import {
  nextProjectColor,
  PROJECT_COLORS,
  saveProjectSchema,
  type Project,
} from '../project-schema'

export function ProjectDialog({
  open,
  project,
  onClose,
  onCreated,
}: {
  open: boolean
  project?: Project
  onClose: () => void
  onCreated?: (project: Project) => void
}) {
  const { data: projects = [] } = useProjects()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const [color, setColor] = useState(project?.color ?? nextProjectColor(projects))
  const [error, setError] = useState<string>()
  const [openedFor, setOpenedFor] = useState<number | null>(null)

  const openedKey = project?.id ?? 0
  if (open && openedFor !== openedKey) {
    setOpenedFor(openedKey)
    setColor(project?.color ?? nextProjectColor(projects))
    setError(undefined)
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = saveProjectSchema.safeParse({
      name: form.get('name'),
      description: form.get('description') || undefined,
      color,
      active: true,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }

    try {
      if (project) {
        await updateProject.mutateAsync({ id: project.id, input: result.data })
        toast('Project updated', result.data.name)
      } else {
        const created = await createProject.mutateAsync(result.data)
        toast('Project created', created.name)
        onCreated?.(created)
      }
      setError(undefined)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, 'The project could not be saved.'))
    }
  }

  return (
    <Dialog onClose={onClose} open={open} title={project ? 'Edit project' : 'Create project'}>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium">
          Name
          <Input defaultValue={project?.name} name="name" placeholder="Website Redesign" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Description
          <Textarea defaultValue={project?.description ?? ''} name="description" placeholder="Optional" />
        </label>
        <fieldset className="space-y-2 text-sm font-medium">
          <legend>Color</legend>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((option) => (
              <button
                aria-label={`Color ${option}`}
                aria-pressed={color === option}
                className={cn(
                  'size-7 rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring',
                  color === option && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
                )}
                key={option}
                onClick={() => setColor(option)}
                style={{ backgroundColor: option }}
                type="button"
              />
            ))}
          </div>
        </fieldset>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button type="submit">{project ? 'Save project' : 'Create project'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
