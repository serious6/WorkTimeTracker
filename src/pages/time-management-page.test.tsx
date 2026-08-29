import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useToastStore } from '@/components/ui/toast-store'
import {
  renderWithProviders,
  resetAppState,
  seedProject,
  signIn,
} from '@/test/harness'
import { TimeManagementPage } from './time-management-page'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('TimeManagementPage', () => {
  it('shows the page heading', async () => {
    renderWithProviders(<TimeManagementPage />)
    expect(await screen.findByRole('heading', { name: /time management/i })).toBeInTheDocument()
  })

  it('shows "select a project to add time" hint when no project chosen', async () => {
    renderWithProviders(<TimeManagementPage />)
    expect(await screen.findByText('Select a project to add time.')).toBeInTheDocument()
  })

  it('quick-add buttons are disabled without a project', async () => {
    renderWithProviders(<TimeManagementPage />)
    // Wait for render to complete
    await screen.findByText('Select a project to add time.')
    const addBtn = screen.getAllByRole('button').find((b) => /15 min/.test(b.textContent ?? ''))
    expect(addBtn).toBeDisabled()
  })

  it('enables quick-add buttons when a project is selected', async () => {
    const project = await seedProject('Alpha')
    renderWithProviders(<TimeManagementPage />)
    await waitFor(() => screen.getByRole('option', { name: 'Alpha' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: /project/i }),
      { target: { value: String(project.id) } },
    )
    await waitFor(() => {
      const addBtn = screen.getAllByRole('button').find((b) => /15 min/.test(b.textContent ?? ''))
      expect(addBtn).not.toBeDisabled()
    })
  })

  it('shows toast after adding time via quick-add', async () => {
    const project = await seedProject('Alpha')
    renderWithProviders(<TimeManagementPage />)
    await waitFor(() => screen.getByRole('option', { name: 'Alpha' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: /project/i }),
      { target: { value: String(project.id) } },
    )
    await waitFor(() => {
      const addBtn = screen.getAllByRole('button').find((b) => /15 min/.test(b.textContent ?? ''))
      expect(addBtn).not.toBeDisabled()
    })
    const addBtn = screen.getAllByRole('button').find((b) => /15 min/.test(b.textContent ?? ''))!
    fireEvent.click(addBtn)
    // Verify via toast store (Toaster is not in test tree, but store is updated)
    await waitFor(() => {
      const toasts = useToastStore.getState().toasts
      expect(toasts.some((t) => t.title === 'Time added')).toBe(true)
    })
  })

  it('opens custom duration dialog', async () => {
    const project = await seedProject('Alpha')
    renderWithProviders(<TimeManagementPage />)
    await waitFor(() => screen.getByRole('option', { name: 'Alpha' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: /project/i }),
      { target: { value: String(project.id) } },
    )
    fireEvent.click(screen.getByRole('button', { name: /^custom$/i }))
    expect(await screen.findByRole('heading', { name: /add custom time/i })).toBeInTheDocument()
  })

  it('shows empty state for the day list', async () => {
    renderWithProviders(<TimeManagementPage />)
    expect(await screen.findByText(/no time tracked on this day/i)).toBeInTheDocument()
  })
})
