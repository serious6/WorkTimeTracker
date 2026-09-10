import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast-store'
import { NoteTemplateDialog } from '@/features/note-templates/components/note-template-dialog'
import {
  useDeleteNoteTemplate,
  useNoteTemplates,
} from '@/features/note-templates/note-template-queries'
import type { NoteTemplate } from '@/features/note-templates/note-template-schema'

export function NoteTemplatesPage() {
  const { data: templates = [], isError, isPending } = useNoteTemplates()
  const deleteTemplate = useDeleteNoteTemplate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<NoteTemplate>()
  const [deleting, setDeleting] = useState<NoteTemplate>()

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Note Templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable texts for recurring notes. Inserting one copies its text, so notes already
            saved never change with the template.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" />
          Create template
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>All note templates</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-6 text-sm text-destructive">
              The note templates could not be loaded.
            </p>
          ) : isPending ? (
            <p className="py-6 text-sm text-muted-foreground">Loading the note templates…</p>
          ) : templates.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No note templates yet. Create one to reuse a recurring note.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {templates.map((template) => (
                <li className="flex items-center gap-3 py-3 text-sm" key={template.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{template.name}</p>
                    <p className="truncate text-muted-foreground">{template.text}</p>
                  </div>
                  <Button
                    aria-label={`Edit note template ${template.name}`}
                    onClick={() => {
                      setEditing(template)
                      setDialogOpen(true)
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </Button>
                  <Button
                    aria-label={`Delete note template ${template.name}`}
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleting(template)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <NoteTemplateDialog
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        template={editing}
      />
      <ConfirmDialog
        confirmLabel="Delete template"
        description="Notes already saved on records keep their text."
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (!deleting) return
          deleteTemplate.mutate(deleting.id, {
            onSuccess: () => toast('Template deleted', deleting.name),
          })
        }}
        open={Boolean(deleting)}
        title="Delete note template?"
      />
    </div>
  )
}
