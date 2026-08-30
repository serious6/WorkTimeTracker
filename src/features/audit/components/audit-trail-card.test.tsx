import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localRepository } from '@/features/storage/local-repository'
import { atTime, renderWithProviders, resetAppState, seedProject, seedTimeEntry, signIn } from '@/test/harness'
import { AuditTrailCard } from './audit-trail-card'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('AuditTrailCard', () => {
  it('shows an empty state without recorded changes', async () => {
    renderWithProviders(<AuditTrailCard />)
    expect(await screen.findByText(/no changes recorded yet/i)).toBeInTheDocument()
  })

  it('shows a load error instead of the empty state', async () => {
    vi.spyOn(localRepository, 'listAuditLog').mockRejectedValueOnce(new Error('unavailable'))

    renderWithProviders(<AuditTrailCard />)

    expect(await screen.findByText(/change history could not be loaded/i)).toBeInTheDocument()
    expect(screen.queryByText(/no changes recorded yet/i)).not.toBeInTheDocument()
  })

  it('shows the actor, the action and the changed fields', async () => {
    const project = await seedProject('Alpha')
    const reference = new Date()
    const entry = await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(reference, 9),
      endTime: atTime(reference, 10),
    })
    await localRepository.updateTimeEntry(entry.id, {
      projectId: project.id,
      startTime: atTime(reference, 9).toISOString(),
      endTime: atTime(reference, 11).toISOString(),
      note: null,
    })

    renderWithProviders(<AuditTrailCard />)

    expect(await screen.findByText('Edited')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText(/^End: /)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByText(/tester@example\.com/).length).toBeGreaterThan(0),
    )
  })

  it('only shows the changes of the selected project', async () => {
    const alpha = await seedProject('Alpha')
    const beta = await seedProject('Beta')
    const reference = new Date()
    await seedTimeEntry({
      projectId: alpha.id,
      startTime: atTime(reference, 9),
      endTime: atTime(reference, 10),
    })
    await seedTimeEntry({
      projectId: beta.id,
      startTime: atTime(reference, 11),
      endTime: atTime(reference, 12),
    })

    renderWithProviders(<AuditTrailCard projectId={alpha.id} />)

    expect(await screen.findByText(/Alpha,/)).toBeInTheDocument()
    expect(screen.queryByText(/Beta,/)).not.toBeInTheDocument()
  })
})
