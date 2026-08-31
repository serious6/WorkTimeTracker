import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { errorMessage } from '@/lib/errors'
import { useCreateWorkItem, useUpdateWorkItem } from '../work-item-queries'
import { WORK_ITEM_KIND_PROJECT, saveWorkItemSchema, type WorkItem } from '../work-item-schema'

/** Create/edit dialog for the user-extensible "project" kind of work item. */
export function WorkItemDialog({
  open,
  workItem,
  onClose,
}: {
  open: boolean
  workItem?: WorkItem
  onClose: () => void
}) {
  const createWorkItem = useCreateWorkItem()
  const updateWorkItem = useUpdateWorkItem()
  const [error, setError] = useState<string>()
  const [openedFor, setOpenedFor] = useState<number | null>(null)

  const openedKey = workItem?.id ?? 0
  if (open && openedFor !== openedKey) {
    setOpenedFor(openedKey)
    setError(undefined)
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = saveWorkItemSchema.safeParse({
      kind: WORK_ITEM_KIND_PROJECT,
      name: form.get('name'),
      costCenter: form.get('costCenter') || undefined,
      active: workItem?.active ?? true,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }

    try {
      if (workItem) {
        await updateWorkItem.mutateAsync({ id: workItem.id, input: result.data })
        toast('Work item updated', result.data.name)
      } else {
        const created = await createWorkItem.mutateAsync(result.data)
        toast('Work item created', created.name)
      }
      setError(undefined)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, 'The work item could not be saved.'))
    }
  }

  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={workItem ? 'Edit project work item' : 'Create project work item'}
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium">
          Name
          <Input defaultValue={workItem?.name} name="name" placeholder="Client X" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Cost center project
          <Input
            defaultValue={workItem?.costCenter ?? ''}
            name="costCenter"
            placeholder="Optional"
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button type="submit">{workItem ? 'Save work item' : 'Create work item'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
