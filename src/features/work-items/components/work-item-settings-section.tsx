import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast-store'
import { errorMessage } from '@/lib/errors'
import { WorkItemDialog } from './work-item-dialog'
import { useDeleteWorkItem, useUpdateWorkItem, useWorkItems } from '../work-item-queries'
import {
  WORK_ITEM_KIND_LABELS,
  isProjectWorkItem,
  type WorkItem,
} from '../work-item-schema'

/** Settings tab listing the fixed presets and the user-extensible project work items. */
export function WorkItemsSettingsSection() {
  const { data: workItems = [] } = useWorkItems()
  const updateWorkItem = useUpdateWorkItem()
  const deleteWorkItem = useDeleteWorkItem()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkItem>()
  const [deleting, setDeleting] = useState<WorkItem>()

  const presets = workItems.filter((item) => !isProjectWorkItem(item))
  const projectItems = workItems.filter(isProjectWorkItem)

  function toggleActive(item: WorkItem, active: boolean) {
    updateWorkItem.mutate(
      { id: item.id, input: { kind: item.kind, name: item.name, costCenter: item.costCenter, active } },
      {
        onError: (failure) =>
          toast('Work item not updated', errorMessage(failure, 'The work item could not be updated.')),
      },
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Preset work items</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Booked instead of a project when time is not spent on client work. Presets can be
            hidden but not renamed or removed.
          </p>
          <ul className="divide-y divide-border">
            {presets.map((item) => (
              <li className="flex items-center justify-between gap-3 py-2 text-sm" key={item.id}>
                <span className="font-medium">{WORK_ITEM_KIND_LABELS[item.kind] ?? item.name}</span>
                <Checkbox
                  checked={item.active}
                  label="Active"
                  onChange={(event) => toggleActive(item, event.target.checked)}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project work items</CardTitle>
          <Button
            onClick={() => {
              setEditing(undefined)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            Add project
          </Button>
        </CardHeader>
        <CardContent>
          {projectItems.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Add a cost center project to book time against it as a work item.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {projectItems.map((item) => (
                <li className="flex items-center gap-3 py-2 text-sm" key={item.id}>
                  <Button
                    className="min-w-0 flex-1 truncate rounded-md px-1 text-left font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setEditing(item)
                      setDialogOpen(true)
                    }}
                    variant="ghost"
                  >
                    {item.name}
                    {item.costCenter && (
                      <span className="ml-2 text-xs text-muted-foreground">{item.costCenter}</span>
                    )}
                  </Button>
                  <Checkbox
                    checked={item.active}
                    label="Active"
                    onChange={(event) => toggleActive(item, event.target.checked)}
                  />
                  <Button
                    aria-label={`Delete ${item.name}`}
                    className="ml-2 text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleting(item)}
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

      <WorkItemDialog onClose={() => setDialogOpen(false)} open={dialogOpen} workItem={editing} />
      <ConfirmDialog
        confirmLabel="Delete work item"
        description="Existing time entries are kept and shown as no longer booked to this work item."
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (!deleting) return
          deleteWorkItem.mutate(deleting.id, {
            onSuccess: () => toast('Work item deleted', deleting.name),
            onError: (failure) =>
              toast('Work item not deleted', errorMessage(failure, 'The work item could not be deleted.')),
          })
        }}
        open={Boolean(deleting)}
        title="Delete work item?"
      />
    </div>
  )
}
