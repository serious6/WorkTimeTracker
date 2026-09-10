import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders, resetAppState, seedNoteTemplate, signIn } from '@/test/harness'
import { createLocalRepository } from '@/features/storage/local-repository'
import { NoteTemplatesPage } from './note-templates-page'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('NoteTemplatesPage', () => {
  it('shows the empty state without templates', async () => {
    renderWithProviders(<NoteTemplatesPage />)

    expect(await screen.findByText(/no note templates yet/i)).toBeInTheDocument()
  })

  it('lists the templates with their text', async () => {
    await seedNoteTemplate({ name: 'Daily standup', text: 'Daily standup with the team' })
    renderWithProviders(<NoteTemplatesPage />)

    expect(await screen.findByText('Daily standup')).toBeInTheDocument()
    expect(screen.getByText('Daily standup with the team')).toBeInTheDocument()
  })

  it('creates a template', async () => {
    renderWithProviders(<NoteTemplatesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /create template/i }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Daily standup' } })
    fireEvent.change(dialog.getByLabelText('Note text'), {
      target: { value: 'Daily standup with the team' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create template' }))

    expect(await screen.findByText('Daily standup with the team')).toBeInTheDocument()
  })

  it('reports a duplicate name', async () => {
    await seedNoteTemplate({ name: 'Daily standup', text: 'Daily standup with the team' })
    renderWithProviders(<NoteTemplatesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /create template/i }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Daily standup' } })
    fireEvent.change(dialog.getByLabelText('Note text'), { target: { value: 'Standup' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Create template' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i)
  })

  it('edits a template without touching the notes already saved', async () => {
    const template = await seedNoteTemplate({
      name: 'Daily standup',
      text: 'Daily standup with the team',
    })
    const project = await createLocalRepository().createProject({
      name: 'Website Redesign',
      description: null,
      color: '#22c55e',
      active: true,
      archived: false,
    })
    await createLocalRepository().createTimeEntry({
      projectId: project.id,
      startTime: '2026-09-01T08:00:00.000Z',
      endTime: '2026-09-01T09:00:00.000Z',
      note: template.text,
    })
    renderWithProviders(<NoteTemplatesPage />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit note template Daily standup' }),
    )
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Note text'), {
      target: { value: 'Standup with the whole team' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Save template' }))

    expect(await screen.findByText('Standup with the whole team')).toBeInTheDocument()
    const entries = await createLocalRepository().listTimeEntries()
    expect(entries[0].note).toBe('Daily standup with the team')
  })

  it('deletes a template and keeps the notes already saved', async () => {
    const template = await seedNoteTemplate({
      name: 'Daily standup',
      text: 'Daily standup with the team',
    })
    const project = await createLocalRepository().createProject({
      name: 'Website Redesign',
      description: null,
      color: '#22c55e',
      active: true,
      archived: false,
    })
    await createLocalRepository().createTimeEntry({
      projectId: project.id,
      startTime: '2026-09-01T08:00:00.000Z',
      endTime: '2026-09-01T09:00:00.000Z',
      note: template.text,
    })
    renderWithProviders(<NoteTemplatesPage />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete note template Daily standup' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Delete template' }))

    await waitFor(() => expect(screen.queryByText('Daily standup')).not.toBeInTheDocument())
    const entries = await createLocalRepository().listTimeEntries()
    expect(entries[0].note).toBe('Daily standup with the team')
  })
})
