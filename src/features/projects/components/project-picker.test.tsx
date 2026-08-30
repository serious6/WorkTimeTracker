import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  renderWithProviders,
  resetAppState,
  seedProject,
  signIn,
} from '@/test/harness'
import { ProjectPicker } from './project-picker'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

function render(overrides: Partial<React.ComponentProps<typeof ProjectPicker>> = {}) {
  const onOpenChange = vi.fn()
  const onSelect = vi.fn()
  const onCreate = vi.fn()
  renderWithProviders(
    <ProjectPicker
      value={null}
      open={false}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      onCreate={onCreate}
      {...overrides}
    />,
  )
  return { onOpenChange, onSelect, onCreate }
}

describe('ProjectPicker – closed state', () => {
  it('shows placeholder when nothing selected', () => {
    render()
    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })

  it('shows selected project name when value is set', async () => {
    const project = await seedProject('Alpha')
    render({ value: project.id })
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
  })

  it('opens on button click', () => {
    const { onOpenChange } = render()
    fireEvent.click(screen.getByRole('button', { name: /select a project/i }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})

describe('ProjectPicker – open state', () => {
  it('lists active projects', async () => {
    await seedProject('ProjectA')
    await seedProject('ProjectB')
    render({ open: true })
    await waitFor(() => {
      expect(screen.getByText('ProjectA')).toBeInTheDocument()
      expect(screen.getByText('ProjectB')).toBeInTheDocument()
    })
  })

  it('filters by search', async () => {
    await seedProject('Alpha')
    await seedProject('Beta')
    render({ open: true })
    await waitFor(() => screen.getByRole('option', { name: /alpha/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /search/i }), { target: { value: 'alph' } })
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('keeps search focused and filters while the parent rerenders', async () => {
    await seedProject('Alpha')
    await seedProject('Beta')
    function Wrapper() {
      const [, setRenders] = useState(0)
      return (
        <div onChange={() => setRenders((count) => count + 1)}>
          <ProjectPicker
            value={null}
            open
            onOpenChange={() => {}}
            onSelect={() => {}}
            onCreate={() => {}}
          />
        </div>
      )
    }
    renderWithProviders(<Wrapper />)
    await waitFor(() => screen.getByRole('option', { name: /alpha/i }))
    const search = screen.getByRole('textbox', { name: /search projects/i })
    const focus = vi.spyOn(search, 'focus')

    for (const value of ['a', 'al', 'alp', 'alph']) {
      expect(search).toHaveFocus()
      fireEvent.change(search, { target: { value } })
    }

    expect(search).toHaveFocus()
    expect(search).toHaveValue('alph')
    expect(focus).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Beta' })).not.toBeInTheDocument()
  })

  it('shows "No projects found" when search has no match', async () => {
    await seedProject('Alpha')
    render({ open: true })
    await waitFor(() => screen.getByRole('option', { name: /alpha/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /search/i }), { target: { value: 'zzz' } })
    expect(screen.getByText(/no projects found/i)).toBeInTheDocument()
  })

  it('calls onSelect and onOpenChange when project is clicked', async () => {
    const project = await seedProject('Alpha')
    const { onSelect, onOpenChange } = render({ open: true })
    await waitFor(() => screen.getByRole('option', { name: /alpha/i }))
    fireEvent.click(screen.getByRole('option', { name: /alpha/i }))
    expect(onSelect).toHaveBeenCalledWith(project.id)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onCreate when "Create project" is clicked', async () => {
    const { onCreate, onOpenChange } = render({ open: true })
    fireEvent.click(screen.getByRole('button', { name: /create project/i }))
    expect(onCreate).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Escape key', async () => {
    const { onOpenChange } = render({ open: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
