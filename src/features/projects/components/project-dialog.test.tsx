import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  renderWithProviders,
  resetAppState,
  seedProject,
  signIn,
} from '@/test/harness'
import { ProjectDialog } from './project-dialog'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('ProjectDialog – create', () => {
  it('renders the create title', () => {
    renderWithProviders(<ProjectDialog open onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: /create project/i })).toBeInTheDocument()
  })

  it('shows a validation error when name is empty', async () => {
    renderWithProviders(<ProjectDialog open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /create project/i }))
    expect(await screen.findByText(/required/i)).toBeInTheDocument()
  })

  it('creates a project and calls onCreated', async () => {
    let created: import('@/features/projects/project-schema').Project | undefined
    renderWithProviders(<ProjectDialog open onClose={() => {}} onCreated={(p) => { created = p }} />)
    fireEvent.change(screen.getByPlaceholderText(/website redesign/i), { target: { value: 'My Project' } })
    fireEvent.click(screen.getByRole('button', { name: /create project/i }))
    await waitFor(() => expect(created).toBeDefined())
    expect(created?.name).toBe('My Project')
  })

  it('keeps the name focused while typing through parent rerenders', () => {
    function Wrapper() {
      const [, setRenders] = useState(0)
      return (
        <div onChange={() => setRenders((count) => count + 1)}>
          <ProjectDialog open onClose={() => {}} />
        </div>
      )
    }
    renderWithProviders(<Wrapper />)
    const input = screen.getByPlaceholderText(/website redesign/i)

    for (const character of 'NewProject') {
      expect(input).toHaveFocus()
      fireEvent.change(input, { target: { value: `${(input as HTMLInputElement).value}${character}` } })
    }

    expect(input).toHaveFocus()
    expect(input).toHaveValue('NewProject')
  })

  it('submits the full name after typing through parent rerenders', async () => {
    let created: import('@/features/projects/project-schema').Project | undefined
    function Wrapper() {
      const [, setRenders] = useState(0)
      return (
        <div onChange={() => setRenders((count) => count + 1)}>
          <ProjectDialog open onClose={() => {}} onCreated={(project) => { created = project }} />
        </div>
      )
    }
    renderWithProviders(<Wrapper />)
    const input = screen.getByPlaceholderText(/website redesign/i)

    for (const character of 'NewProject') {
      expect(input).toHaveFocus()
      fireEvent.change(input, { target: { value: `${(input as HTMLInputElement).value}${character}` } })
    }
    fireEvent.click(screen.getByRole('button', { name: /create project/i }))

    await waitFor(() => expect(created?.name).toBe('NewProject'))
  })

  it('autofocuses the name, closes on Escape, and restores trigger focus', () => {
    function Wrapper() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">New project</button>
          <ProjectDialog open={open} onClose={() => setOpen(false)} />
        </>
      )
    }
    renderWithProviders(<Wrapper />)
    const trigger = screen.getByRole('button', { name: 'New project' })
    trigger.focus()
    fireEvent.click(trigger)

    expect(screen.getByPlaceholderText(/website redesign/i)).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('allows picking a different color', () => {
    renderWithProviders(<ProjectDialog open onClose={() => {}} />)
    const colorBtn = screen.getAllByRole('button', { name: /^Color #/i })[1]
    fireEvent.click(colorBtn)
    expect(colorBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onClose when Cancel is clicked', () => {
    let closed = false
    renderWithProviders(<ProjectDialog open onClose={() => { closed = true }} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(closed).toBe(true)
  })
})

describe('ProjectDialog – edit', () => {
  it('renders the edit title', async () => {
    const project = await seedProject('Existing')
    renderWithProviders(<ProjectDialog open project={project} onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: /edit project/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing')).toBeInTheDocument()
  })

  it('updates a project', async () => {
    const project = await seedProject('OldName')
    let closed = false
    renderWithProviders(<ProjectDialog open project={project} onClose={() => { closed = true }} />)
    fireEvent.change(screen.getByDisplayValue('OldName'), { target: { value: 'NewName' } })
    fireEvent.click(screen.getByRole('button', { name: /save project/i }))
    await waitFor(() => expect(closed).toBe(true))
  })
})
