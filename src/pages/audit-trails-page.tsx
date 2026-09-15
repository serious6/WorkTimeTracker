import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Select } from '@/components/ui/input'
import { formatMoment } from '@/features/audit/audit-changes'
import {
  absenceAuditRecords,
  auditListRange,
  auditTrailPage,
  AUDIT_RANGES,
  AUDIT_TRAIL_ACTION_LABELS,
  AUDIT_TRAIL_TYPES,
  AUDIT_TRAIL_TYPE_LABELS,
  DEFAULT_AUDIT_RANGE,
  mergeAuditRecords,
  overtimeAuditRecords,
  securityAuditRecords,
  timeEntryAuditRecords,
  type AuditRangeId,
  type AuditTrailType,
} from '@/features/audit/audit-trails'
import { useAuditTrailPages } from '@/features/audit/use-audit-pages'
import { useProjects } from '@/features/projects/project-queries'
import { DELETED_PROJECT_NAME } from '@/features/time-entries/time-entry-schema'

/**
 * Read-only compliance evidence: every recorded change of the signed-in user,
 * across all audit trails, narrowed by a window and by trail type. The view
 * offers no write action, and the queries stay scoped to the signed-in user.
 */
export function AuditTrailsPage() {
  const [rangeId, setRangeId] = useState<AuditRangeId>(DEFAULT_AUDIT_RANGE)
  const [types, setTypes] = useState<AuditTrailType[]>([])
  // Every filter change restarts the paging at the first page.
  const [pages, setPages] = useState(1)
  const pagingGeneration = useRef(0)
  const range = useMemo(() => auditListRange(rangeId), [rangeId])
  const { timeEntryAudits, absenceAudits, overtimeAudits, securityAudits } = useAuditTrailPages(range)
  const projectQuery = useProjects()
  const projects = projectQuery.data ?? []

  const projectName = (id: number | null) =>
    projects.find((project) => project.id === id)?.name ?? DELETED_PROJECT_NAME

  // The project names label the time entry records, so a failed or pending
  // project query would present every project as deleted.
  const trailQueries = [timeEntryAudits, absenceAudits, overtimeAudits, securityAudits]
  const queries = [...trailQueries, projectQuery]
  const isError = projectQuery.isError ||
    trailQueries.some((query) => query.isError && !query.isFetchNextPageError)
  const isPending = queries.some((query) => query.isPending)
  const isLoadingMore = trailQueries.some((query) => query.isFetchingNextPage)
  const sourceTypes: AuditTrailType[][] = [
    ['timeEntry'], ['absence'], ['overtime'], ['identity', 'configuration'],
  ]
  const relevantQueries = trailQueries.filter((_, index) =>
    types.length === 0 || sourceTypes[index].some((type) => types.includes(type)),
  )
  const isNextPageError = relevantQueries.some((query) => query.isFetchNextPageError)
  const records = mergeAuditRecords([
    timeEntryAuditRecords(timeEntryAudits.data ?? [], projectName),
    absenceAuditRecords(absenceAudits.data ?? []),
    overtimeAuditRecords(overtimeAudits.data ?? []),
    securityAuditRecords(securityAudits.data ?? [], projectName),
  ])
  const { visible, hasMore } = auditTrailPage(
    records, types, pages, relevantQueries.some((query) => query.hasNextPage),
  )

  const loadMore = async () => {
    const generation = pagingGeneration.current
    const results = await Promise.all(
      relevantQueries.filter((query) => query.hasNextPage).map((query) => query.fetchNextPage()),
    )
    if (generation === pagingGeneration.current && results.every((query) => !query.isError)) {
      setPages((current) => current + 1)
    }
  }

  const toggleType = (type: AuditTrailType) => {
    pagingGeneration.current += 1
    setPages(1)
    setTypes((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    )
  }

  const selectRange = (id: AuditRangeId) => {
    pagingGeneration.current += 1
    setPages(1)
    setRangeId(id)
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Audit Trails</h1>
        <p className="text-sm text-muted-foreground">
          Every change you recorded, newest first. The trails are append-only and cannot be edited
          or deleted here.
        </p>
      </header>

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>Recorded changes</CardTitle>
            <p className="text-sm text-muted-foreground">
              {isPending
                ? 'Reading the audit trails…'
                : `Showing ${visible.length} record${visible.length === 1 ? '' : 's'} of the selected period.`}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <Field className="sm:w-48" label="Period">
              <Select
                onChange={(event) => selectRange(event.target.value as AuditRangeId)}
                value={rangeId}
              >
                {AUDIT_RANGES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Audit trail types</legend>
              <div className="flex flex-wrap gap-x-4">
                {AUDIT_TRAIL_TYPES.map((type) => (
                  <Checkbox
                    checked={types.includes(type)}
                    key={type}
                    label={AUDIT_TRAIL_TYPE_LABELS[type]}
                    onChange={() => toggleType(type)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-6 text-sm text-destructive">
              The audit trails could not be loaded.
            </p>
          ) : isPending ? (
            <p className="py-6 text-sm text-muted-foreground">Loading the audit trails…</p>
          ) : visible.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No audit records for the selected filters.
            </p>
          ) : (
            <ul className="divide-y divide-border" data-testid="audit-records">
              {visible.map((record) => (
                <li className="py-3 text-sm" key={record.key}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {AUDIT_TRAIL_TYPE_LABELS[record.type]}
                    </span>
                    <span className="font-medium">{AUDIT_TRAIL_ACTION_LABELS[record.action]}</span>
                    <span className="text-muted-foreground">{record.summary}</span>
                  </div>
                  {record.changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {record.changes.map((change) => (
                        <li key={change.field}>
                          {change.field}: {change.from} → {change.to}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.actor} · {formatMoment(record.recordedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {isNextPageError && (
            <p className="pt-4 text-sm text-destructive">
              The next audit records could not be loaded.
            </p>
          )}
          {!isError && !isPending && (hasMore || isLoadingMore) && (
            <div className="pt-4">
              <Button
                aria-busy={isLoadingMore}
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
                variant="outline"
              >
                {isLoadingMore ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          )}
          {!isError && !isNextPageError && !isPending && !isLoadingMore && !hasMore && pages > 1 && (
            <p className="pt-4 text-sm text-muted-foreground">No further audit records.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
