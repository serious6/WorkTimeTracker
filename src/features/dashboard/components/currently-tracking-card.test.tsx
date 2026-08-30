import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@/features/projects/project-schema'
import type { useTimer } from '@/features/timer/use-timer'
import { createTestQueryClient, renderWithProviders } from '@/test/harness'
import { combineDateAndTime, toDateKey, toTimeKey } from '@/lib/date'
import { CurrentlyTrackingCard } from './currently-tracking-card'

function project(id: number, name: string, color = '#22c55e'): Project {
  return { id, name, description: null, color, active: true, createdAt: '', updatedAt: '' }
}

function makeTimer(overrides: Partial<ReturnType<typeof useTimer>> = {}): ReturnType<typeof useTimer> {
  return {
    status: { running: undefined, paused: false, projectId: null, elapsedMs: 0 },
    isPending: false,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    switchTo: vi.fn(),
    correctStart: vi.fn(),
    setNote: vi.fn(),
    ...overrides,
  }
}

describe('CurrentlyTrackingCard – idle state', () => {
  it('prompts to create a project when no projects exist', () => {
    render(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[]}
        timer={makeTimer()}
      />,
    )
    expect(screen.getByText('Create your first project to start tracking.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument()
  })

  it('calls onCreateProject when Create project is clicked', () => {
    const onCreateProject = vi.fn()
    render(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={onCreateProject}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[]}
        timer={makeTimer()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(onCreateProject).toHaveBeenCalledOnce()
  })

  it('shows the project picker and Start timer button when projects exist', () => {
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer()}
      />,
    )
    expect(screen.getByRole('button', { name: /Start timer/i })).toBeInTheDocument()
  })
})

describe('CurrentlyTrackingCard – running state', () => {
  function makeRunningEntry() {
    return {
      id: 1,
      projectId: 1,
      startTime: new Date(Date.now() - 60_000).toISOString(),
      endTime: null,
      entryType: 'work' as const,
      note: null,
      createdAt: '',
      updatedAt: '',
    }
  }

  it('shows elapsed time and project name', () => {
    const projects = [project(1, 'Website')]
    const running = makeRunningEntry()
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={projects}
        timer={makeTimer({ status: { running, paused: false, projectId: 1, elapsedMs: 65_000 } })}
      />,
    )
    expect(screen.getByText('Website')).toBeInTheDocument()
    expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument()
  })

  it('names the running state instead of relying on the accent colour alone', () => {
    const running = makeRunningEntry()
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({ status: { running, paused: false, projectId: 1, elapsedMs: 0 } })}
      />,
    )
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('keeps the state readable next to a project description', () => {
    const running = makeRunningEntry()
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[{ ...project(1, 'Website'), description: 'Relaunch' }]}
        timer={makeTimer({ status: { running, paused: false, projectId: 1, elapsedMs: 0 } })}
      />,
    )
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('· Relaunch')).toBeInTheDocument()
  })

  it('calls stop when Stop timer is clicked', () => {
    const stop = vi.fn()
    const running = makeRunningEntry()
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({ stop, status: { running, paused: false, projectId: 1, elapsedMs: 0 } })}
      />,
    )
    fireEvent.click(screen.getByLabelText('Stop timer'))
    expect(stop).toHaveBeenCalledOnce()
  })

  it('calls pause when Pause timer is clicked', () => {
    const pause = vi.fn()
    const running = makeRunningEntry()
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({ pause, status: { running, paused: false, projectId: 1, elapsedMs: 0 } })}
      />,
    )
    fireEvent.click(screen.getByLabelText('Pause timer'))
    expect(pause).toHaveBeenCalledOnce()
  })
})

describe('CurrentlyTrackingCard – paused state', () => {
  it('shows Resume timer button and "Paused" label', () => {
    const resume = vi.fn()
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({ resume, status: { running: undefined, paused: true, projectId: 1, elapsedMs: 3_600_000 } })}
      />,
    )
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByLabelText('Resume timer')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Resume timer'))
    expect(resume).toHaveBeenCalledOnce()
  })

  it('shows deleted project name when project is not found', () => {
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[]}
        timer={makeTimer({ status: { running: undefined, paused: true, projectId: 99, elapsedMs: 0 } })}
      />,
    )
    expect(screen.getAllByText('Deleted project').length).toBeGreaterThanOrEqual(1)
  })
})

describe('CurrentlyTrackingCard – note behaviour', () => {
  function makeRunningEntry(note: string | null = null) {
    return {
      id: 1,
      projectId: 1,
      startTime: new Date().toISOString(),
      endTime: null,
      entryType: 'work' as const,
      note,
      createdAt: '',
      updatedAt: '',
    }
  }

  it('calls setNote when the note input loses focus', () => {
    const setNote = vi.fn()
    const running = makeRunningEntry()
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({ setNote, status: { running, paused: false, projectId: 1, elapsedMs: 0 } })}
      />,
    )
    const noteInput = screen.getByLabelText('Add a note')
    fireEvent.change(noteInput, { target: { value: 'Some note' } })
    fireEvent.blur(noteInput)
    expect(setNote).toHaveBeenCalledWith('Some note')
  })

  it('syncs note field when running entry note changes between renders', () => {
    const running1 = makeRunningEntry(null)
    const running2 = makeRunningEntry('Updated note')
    const qc = createTestQueryClient()
    const { rerender } = renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({ status: { running: running1, paused: false, projectId: 1, elapsedMs: 0 } })}
      />,
      qc,
    )
    expect((screen.getByLabelText('Add a note') as HTMLInputElement).value).toBe('')
    rerender(
      <QueryClientProvider client={qc}>
        <CurrentlyTrackingCard
          now={Date.now()}
          onCreateProject={vi.fn()}
          onPickerOpenChange={vi.fn()}
          pickerOpen={false}
          projects={[project(1, 'Website')]}
          timer={makeTimer({ status: { running: running2, paused: false, projectId: 1, elapsedMs: 0 } })}
        />
      </QueryClientProvider>,
    )
    expect((screen.getByLabelText('Add a note') as HTMLInputElement).value).toBe('Updated note')
  })
})

describe('CurrentlyTrackingCard – start correction', () => {
  function running(startTime: Date) {
    return {
      id: 7,
      projectId: 1,
      startTime: startTime.toISOString(),
      endTime: null,
      entryType: 'work' as const,
      note: null,
      createdAt: '',
      updatedAt: '',
    }
  }

  it('corrects the start time of the running entry', async () => {
    const now = new Date('2026-05-04T10:00:00.000Z')
    const entry = running(new Date(now.getTime() - 60_000))
    const correctStart = vi.fn().mockResolvedValue(true)
    renderWithProviders(
      <CurrentlyTrackingCard
        now={now.getTime()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({
          correctStart,
          status: { running: entry, paused: false, projectId: 1, elapsedMs: 60_000 },
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Correct start time' }))
    const dateField = screen.getByLabelText('Start date') as HTMLInputElement
    const field = screen.getByLabelText('Start time') as HTMLInputElement
    expect(dateField.value).toBe(toDateKey(new Date(entry.startTime)))
    expect(field.value).toBe(toTimeKey(new Date(entry.startTime)))

    fireEvent.change(dateField, { target: { value: '2026-05-03' } })
    fireEvent.change(field, { target: { value: '08:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save start time' }))

    await waitFor(() => expect(correctStart).toHaveBeenCalledOnce())
    expect(correctStart.mock.calls[0][0]).toEqual(
      combineDateAndTime('2026-05-03', '08:00'),
    )
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save start time' })).not.toBeInTheDocument(),
    )
  })

  it('keeps the dialog open when the correction is rejected', async () => {
    const now = new Date('2026-05-04T10:00:00.000Z')
    const correctStart = vi.fn().mockResolvedValue(false)
    renderWithProviders(
      <CurrentlyTrackingCard
        now={now.getTime()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({
          correctStart,
          status: {
            running: running(new Date(now.getTime() - 60_000)),
            paused: false,
            projectId: 1,
            elapsedMs: 60_000,
          },
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Correct start time' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save start time' }))

    await waitFor(() => expect(correctStart).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Save start time' })).toBeInTheDocument()
  })

  it('hides the correction button while paused', () => {
    renderWithProviders(
      <CurrentlyTrackingCard
        now={Date.now()}
        onCreateProject={vi.fn()}
        onPickerOpenChange={vi.fn()}
        pickerOpen={false}
        projects={[project(1, 'Website')]}
        timer={makeTimer({
          status: { running: undefined, paused: true, projectId: 1, elapsedMs: 60_000 },
        })}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Correct start time' })).not.toBeInTheDocument()
  })
})
