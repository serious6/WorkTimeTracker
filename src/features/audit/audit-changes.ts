import { formatShortDay, formatTimeOfDay } from '@/lib/date'
import type { AuditChange } from './audit-schema'
import type { AuditLogAction, AuditSnapshot } from './audit-schema'

export const AUDIT_ACTION_LABEL: Record<AuditLogAction, string> = {
  create: 'Created',
  update: 'Edited',
  delete: 'Deleted',
}

const RUNNING = 'running'
const NO_NOTE = 'no note'

export function formatMoment(value: string | null): string {
  if (!value) return RUNNING
  const date = new Date(value)
  return `${formatShortDay(date)}, ${formatTimeOfDay(date)}`
}

/** Short description of an entry, used for created and deleted entries. */
export function auditSummary(
  snapshot: AuditSnapshot | null,
  projectName: (projectId: number | null) => string,
): string {
  if (!snapshot) return ''
  const end = snapshot.endTime ? formatTimeOfDay(new Date(snapshot.endTime)) : RUNNING
  return `${projectName(snapshot.projectId)}, ${formatMoment(snapshot.startTime)} – ${end}`
}

/** The fields that differ between the recorded old and new value. */
export function auditChanges(
  oldValue: AuditSnapshot | null,
  newValue: AuditSnapshot | null,
  projectName: (projectId: number | null) => string,
): AuditChange[] {
  if (!oldValue || !newValue) return []
  const changes: AuditChange[] = []
  if (oldValue.projectId !== newValue.projectId) {
    changes.push({
      field: 'Project',
      from: projectName(oldValue.projectId),
      to: projectName(newValue.projectId),
    })
  }
  if (oldValue.startTime !== newValue.startTime) {
    changes.push({
      field: 'Start',
      from: formatMoment(oldValue.startTime),
      to: formatMoment(newValue.startTime),
    })
  }
  if (oldValue.endTime !== newValue.endTime) {
    changes.push({
      field: 'End',
      from: formatMoment(oldValue.endTime),
      to: formatMoment(newValue.endTime),
    })
  }
  if (oldValue.note !== newValue.note) {
    changes.push({
      field: 'Note',
      from: oldValue.note ?? NO_NOTE,
      to: newValue.note ?? NO_NOTE,
    })
  }
  return changes
}
