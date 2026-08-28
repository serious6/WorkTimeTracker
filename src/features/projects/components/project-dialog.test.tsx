import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function openCreate(onClose = () => {}, onCreated?: (p: import('@/features/projects/project-schema').Project) => void) {
  return renderWithProviders(
    <ProjectDialog open onClose={onClose} onCreated={onCreated} />,
  )
}

describe('ProjectDialog – create', () => {
  it('renders the create title', () => {
    openCreate()
    expect(screen.getByRole('heading', { name: /create project/i })).toBeInTheDocument()
  })

  it('shows a validation error when name is empty', async () => {
    openCreate()
    await userEvent.click(screen.getByRole('button', { name: /create project/i }))
    expect(await screen.findByText(/required/i)).toBeInTheDocument()
  })

  it('creates a project and calls onCreated', async () => {
    let created: import('@/features/projects/project-schema').Project | undefined
    openCreate(() => {}, (p) => { created = p })
    await userEvent.type(screen.getByPlaceholderText(/website redesign/i), 'My Project')
    await userEvent.click(screen.getByRole('button', { name: /create project/i }))
    await waitFor(() => expect(created).toBeDefined())
    expect(created?.name).toBe('My Project')
  })

  it('allows picking a different color', async () => {
    openCreate()
    const colorBtn = screen.getAllByRole('button', { name: /^Color #/i })[1]
    await userEvent.click(colorBtn)
    expect(colorBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onClose when Cancel is clicked', async () => {
    let closed = false
    openCreate(() => { closed = true })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(closed).toBe(true)
  })
})

describe('ProjectDialog – edit', () => {
  it('renders the edit title', async () => {
    const project = await seedProject('Existing')
    renderWithProviders(
      <ProjectDialog open project={project} onClose={() => {}} />,
    )
    expect(screen.getByRole('heading', { name: /edit project/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing')).toBeInTheDocument()
  })

  it('updates a project', async () => {
    const project = await seedProject('OldName')
    let closed = false
    renderWithProviders(
      <ProjectDialog open project={project} onClose={() => { closed = true }} />,
    )
    const input = screen.getByDisplayValue('OldName')
    await userEvent.clear(input)
    await userEvent.type(input, 'NewName')
    await userEvent.click(screen.getByRole('button', { name: /save project/i }))
    await waitFor(() => expect(closed).toBe(true))
  })
})
