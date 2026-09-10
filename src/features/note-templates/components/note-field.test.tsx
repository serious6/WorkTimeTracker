import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders, resetAppState, seedNoteTemplate, signIn } from '@/test/harness'
import { NoteField } from './note-field'

function Host() {
  const [note, setNote] = useState('')
  return <NoteField onChange={setNote} value={note} />
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('NoteField', () => {
  it('hides the picker while no template exists', async () => {
    renderWithProviders(<Host />)

    await waitFor(() =>
      expect(screen.queryByLabelText('Insert note template')).not.toBeInTheDocument(),
    )
  })

  it('accepts free text', async () => {
    renderWithProviders(<Host />)

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Pair programming' } })

    expect(screen.getByLabelText('Note')).toHaveValue('Pair programming')
  })

  it('inserts the text of a template and keeps it editable', async () => {
    const template = await seedNoteTemplate({
      name: 'Daily standup',
      text: 'Daily standup with the team',
    })
    renderWithProviders(<Host />)
    const picker = await screen.findByLabelText('Insert note template')

    fireEvent.change(picker, { target: { value: `${template.id}` } })

    const note = screen.getByLabelText('Note')
    expect(note).toHaveValue('Daily standup with the team')
    expect(picker).toHaveValue('')

    fireEvent.change(note, { target: { value: 'Daily standup with the team, 15 minutes' } })
    expect(note).toHaveValue('Daily standup with the team, 15 minutes')
  })
})
