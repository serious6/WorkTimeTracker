import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  renderWithProviders,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
  atTime,
} from '@/test/harness'
import { TimeEntryList } from './time-entry-list'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

async function setup(entryOverrides: Partial<{ note: string | null }> = {}) {
  const project = await seedProject('Alpha')
  const ref = new Date()
  const entry = await seedTimeEntry({
    projectId: project.id,
    startTime: atTime(ref, 9),
    endTime: atTime(ref, 10),
    note: entryOverrides.note ?? null,
  })
  return { project, entry }
}

function renderList(
  entries: TimeEntry[],
  projects: Project[],
  onPlay = vi.fn(),
  onPause = vi.fn(),
) {
  return renderWithProviders(
    <TimeEntryList
      entries={entries}
      projects={projects}
      now={Date.now()}
      onPlay={onPlay}
      onPause={onPause}
    />,
  )
}

describe('TimeEntryList', () => {
  it('renders empty state node when entries is empty', () => {
    renderWithProviders(
      <TimeEntryList
        entries={[]}
        projects={[]}
        now={Date.now()}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        emptyState={<p>Nothing here</p>}
      />,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders list of entries', async () => {
    const { project, entry } = await setup()
    renderList([entry], [project])
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('shows note when entry has one', async () => {
    const { project, entry } = await setup({ note: 'standup' })
    renderList([entry], [project])
    expect(screen.getByText('standup')).toBeInTheDocument()
  })

  it('shows Deleted project when project not in list', async () => {
    const { entry } = await setup()
    renderList([entry], [])
    expect(screen.getByText(/deleted project/i)).toBeInTheDocument()
  })

  it('labels project-less break entries as breaks', async () => {
    const { entry } = await setup()
    renderList([{ ...entry, projectId: null, entryType: 'break' }], [])

    expect(screen.getByText('Break')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /actions for break/i })).toBeInTheDocument()
  })

  it('calls onPlay when play button clicked', async () => {
    const onPlay = vi.fn()
    const { project, entry } = await setup()
    renderList([entry], [project], onPlay)
    fireEvent.click(screen.getByRole('button', { name: /start timer for alpha/i }))
    expect(onPlay).toHaveBeenCalledWith(project.id)
  })

  it('opens edit dialog via menu', async () => {
    const { project, entry } = await setup()
    renderList([entry], [project])
    fireEvent.click(screen.getByRole('button', { name: /actions for alpha/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^edit$/i }))
    expect(await screen.findByRole('heading', { name: /edit time entry/i })).toBeInTheDocument()
  })

  it('opens note dialog via menu', async () => {
    const { project, entry } = await setup()
    renderList([entry], [project])
    fireEvent.click(screen.getByRole('button', { name: /actions for alpha/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /add note/i }))
    expect(await screen.findByRole('heading', { name: /entry note/i })).toBeInTheDocument()
  })

  it('opens delete confirm dialog via menu', async () => {
    const { project, entry } = await setup()
    renderList([entry], [project])
    fireEvent.click(screen.getByRole('button', { name: /actions for alpha/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }))
    expect(await screen.findByText(/delete time entry\?/i)).toBeInTheDocument()
  })

  it('closes confirm dialog after confirming delete', async () => {
    const { project, entry } = await setup()
    renderList([entry], [project])
    fireEvent.click(screen.getByRole('button', { name: /actions for alpha/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }))
    await screen.findByText(/delete time entry\?/i)
    fireEvent.click(screen.getByRole('button', { name: /delete entry/i }))
    // The confirm dialog closes after successful mutation
    await waitFor(() => expect(screen.queryByText(/delete time entry\?/i)).not.toBeInTheDocument())
  })

  it('opens duplicate dialog via menu', async () => {
    const { project, entry } = await setup()
    renderList([entry], [project])
    fireEvent.click(screen.getByRole('button', { name: /actions for alpha/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /duplicate/i }))
    expect(await screen.findByRole('heading', { name: /duplicate time entry/i })).toBeInTheDocument()
  })

  it('saves a note via the note dialog', async () => {
    const { project, entry } = await setup()
    renderList([entry], [project])
    fireEvent.click(screen.getByRole('button', { name: /actions for alpha/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /add note/i }))
    const noteInput = await screen.findByPlaceholderText(/what did you work on/i)
    fireEvent.change(noteInput, { target: { value: 'my note' } })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: /entry note/i })).not.toBeInTheDocument())
  })

  it('cancels the note dialog without saving', async () => {
    const { project, entry } = await setup()
    renderList([entry], [project])
    fireEvent.click(screen.getByRole('button', { name: /actions for alpha/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /add note/i }))
    await screen.findByRole('heading', { name: /entry note/i })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: /entry note/i })).not.toBeInTheDocument())
  })
})
