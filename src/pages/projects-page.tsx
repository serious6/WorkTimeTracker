import { useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigationStore } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { errorToast, toast } from '@/components/ui/toast-store'
import { projectTotals } from '@/features/dashboard/metrics'
import { ProjectDialog } from '@/features/projects/components/project-dialog'
import {
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '@/features/projects/project-queries'
import type { Project } from '@/features/projects/project-schema'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { formatDuration } from '@/lib/date'
import { errorMessage } from '@/lib/errors'

export function ProjectsPage() {
  const { data: projects = [] } = useProjects()
  const { data: entries = [] } = useTimeEntries()
  const deleteProject = useDeleteProject()
  const updateProject = useUpdateProject()
  const navigate = useNavigationStore((state) => state.navigate)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Project>()
  const [deleting, setDeleting] = useState<Project>()

  const totals = projectTotals(entries, projects)

  /**
   * Archiving only hides the project from the tracking selections. A running
   * timer of that project keeps running, and its entries stay untouched.
   */
  function toggleArchived(project: Project) {
    const archived = !project.archived
    updateProject.mutate(
      {
        id: project.id,
        input: {
          name: project.name,
          description: project.description,
          color: project.color,
          active: project.active,
          archived,
        },
      },
      {
        onSuccess: () => toast(archived ? 'Project archived' : 'Project restored', project.name),
        onError: (failure) =>
          errorToast(
            archived ? 'Project not archived' : 'Project not restored',
            errorMessage(failure, 'The project could not be saved.'),
          ),
      },
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Manage the projects you track time for.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" />
          Create project
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>All projects</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Create your first project to start tracking time.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {projects.map((project) => (
                <li className="flex items-center gap-3 py-2 text-sm" key={project.id}>
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <Button
                    className="min-w-0 flex-1 truncate rounded-md px-1 text-left font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate('time-entries', { projectFilter: project.id })}
                    variant="ghost"
                  >
                    {project.name}
                    {project.description && (
                      <span className="ml-2 text-xs text-muted-foreground">{project.description}</span>
                    )}
                  </Button>
                  {project.archived && (
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Archived
                    </span>
                  )}
                  <span className="tabular-nums text-muted-foreground">
                    {formatDuration(
                      totals.find((item) => item.projectId === project.id)?.minutes ?? 0,
                    )}
                  </span>
                  <Button
                    aria-label={`${project.archived ? 'Unarchive' : 'Archive'} ${project.name}`}
                    onClick={() => toggleArchived(project)}
                    size="icon"
                    variant="ghost"
                  >
                    {project.archived ? (
                      <ArchiveRestore className="size-4" />
                    ) : (
                      <Archive className="size-4" />
                    )}
                  </Button>
                  <Button
                    aria-label={`Edit ${project.name}`}
                    onClick={() => {
                      setEditing(project)
                      setDialogOpen(true)
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    aria-label={`Delete ${project.name}`}
                    className="ml-2 text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleting(project)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ProjectDialog
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        project={editing}
      />
      <ConfirmDialog
        confirmLabel="Delete project"
        description="Existing time entries are kept and shown as deleted project."
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (!deleting) return
          deleteProject.mutate(deleting.id, {
            onSuccess: () => toast('Project deleted', deleting.name),
          })
        }}
        open={Boolean(deleting)}
        title="Delete project?"
      />
    </div>
  )
}
