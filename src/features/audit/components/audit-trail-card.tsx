import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/features/auth/session-queries'
import { useProjects } from '@/features/projects/project-queries'
import { DELETED_PROJECT_NAME } from '@/features/time-entries/time-entry-schema'
import { formatMoment, auditChanges, auditSummary, AUDIT_ACTION_LABEL } from '../audit-changes'
import { useAuditLog } from '../audit-queries'
import { parseSnapshot, TIME_ENTRY_ENTITY } from '../audit-schema'

const VISIBLE_RECORDS = 20

/** Who changed what and when, as required for the compliance evidence. */
export function AuditTrailCard({ projectId = null }: { projectId?: number | null }) {
  const { data: records = [] } = useAuditLog()
  const { data: projects = [] } = useProjects()
  const { data: user } = useSession()

  const projectName = (id: number | null) =>
    projects.find((project) => project.id === id)?.name ?? DELETED_PROJECT_NAME

  const visible = records
    .map((record) => ({
      record,
      oldValue: parseSnapshot(record.oldValue),
      newValue: parseSnapshot(record.newValue),
    }))
    .filter(
      ({ record, oldValue, newValue }) =>
        record.entity === TIME_ENTRY_ENTITY &&
        (projectId === null ||
          oldValue?.projectId === projectId ||
          newValue?.projectId === projectId),
    )
    .slice(0, VISIBLE_RECORDS)

  return (
    <Card aria-label="Change History" role="region">
      <CardHeader>
        <CardTitle>Change History</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every created, edited and deleted time entry, newest first.
        </p>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map(({ record, oldValue, newValue }) => {
              const changes = auditChanges(oldValue, newValue, projectName)
              return (
                <li className="py-2 text-sm" key={record.id}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{AUDIT_ACTION_LABEL[record.action]}</span>
                    <span className="text-muted-foreground">
                      {auditSummary(newValue ?? oldValue, projectName)}
                    </span>
                  </div>
                  {changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {changes.map((change) => (
                        <li key={change.field}>
                          {change.field}: {change.from} → {change.to}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {user?.email ?? 'Unknown user'} · {formatMoment(record.createdAt)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
