import { useTimeEntries, useCreateTimeEntry } from '@/features/time-entries/time-entry-queries'
import { saveTimeEntrySchema } from '@/features/time-entries/time-entry-schema'
import { fromDateKey } from '@/lib/date'
import { findFreeSlot } from './quick-add'

export const DAY_FULL_MESSAGE = 'No free time left on this day for that duration'

export type QuickAddInput = {
  projectId: number
  dateKey: string
  minutes: number
  note?: string
}

/**
 * Adds already worked time to a project by placing it in the first free slot of
 * the selected day, so that it never overlaps existing entries.
 */
export function useQuickAdd() {
  const { data: entries = [] } = useTimeEntries()
  const createEntry = useCreateTimeEntry()

  return async ({ projectId, dateKey, minutes, note }: QuickAddInput) => {
    const slot = findFreeSlot(entries, fromDateKey(dateKey), minutes)
    if (!slot) throw new Error(DAY_FULL_MESSAGE)
    await createEntry.mutateAsync(
      saveTimeEntrySchema.parse({ projectId, ...slot, note: note?.trim() || null }),
    )
  }
}
