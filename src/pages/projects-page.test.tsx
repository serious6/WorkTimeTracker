import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  renderWithProviders,
  resetAppState,
  seedProject,
  signIn,
} from '@/test/harness'
import { ProjectsPage } from './projects-page'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('ProjectsPage', () => {
  it('shows empty state when no projects exist', async () => {
    renderWithProviders(<ProjectsPage />)
    expect(await screen.findByText(/create your first project/i)).toBeInTheDocument()
  })

  it('lists seeded projects', async () => {
    await seedProject('Alpha')
    await seedProject('Beta')
    renderWithProviders(<ProjectsPage />)
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(await screen.findByText('Beta')).toBeInTheDocument()
  })

  it('opens create dialog when "Create project" header button is clicked', async () => {
    renderWithProviders(<ProjectsPage />)
    await userEvent.click(screen.getByRole('button', { name: /^create project$/i }))
    expect(await screen.findByRole('heading', { name: /create project/i })).toBeInTheDocument()
  })

  it('opens edit dialog with project data', async () => {
    const project = await seedProject('EditMe')
    renderWithProviders(<ProjectsPage />)
    await screen.findByText('EditMe')
    await userEvent.click(screen.getByRole('button', { name: /edit editme/i }))
    expect(await screen.findByDisplayValue('EditMe')).toBeInTheDocument()
  })

  it('opens confirm delete dialog when trash button is clicked', async () => {
    await seedProject('ToDelete')
    renderWithProviders(<ProjectsPage />)
    await screen.findByText('ToDelete')
    await userEvent.click(screen.getByRole('button', { name: /delete todelete/i }))
    expect(await screen.findByText(/delete project\?/i)).toBeInTheDocument()
  })

  it('deletes a project after confirmation', async () => {
    await seedProject('GoneProject')
    renderWithProviders(<ProjectsPage />)
    await screen.findByText('GoneProject')
    await userEvent.click(screen.getByRole('button', { name: /delete goneproject/i }))
    await userEvent.click(await screen.findByRole('button', { name: /delete project$/i }))
    await waitFor(() => expect(screen.queryByText('GoneProject')).not.toBeInTheDocument())
  })

  it('creates a project from the dialog', async () => {
    renderWithProviders(<ProjectsPage />)
    await userEvent.click(screen.getByRole('button', { name: /^create project$/i }))
    await userEvent.type(await screen.findByPlaceholderText(/website redesign/i), 'NewProject')
    await userEvent.click(screen.getByRole('button', { name: /^create project$/i }))
    expect(await screen.findByText('NewProject')).toBeInTheDocument()
  })
})
