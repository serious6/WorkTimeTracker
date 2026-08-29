import { fireEvent, screen, waitFor } from '@testing-library/react'
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
