import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('opens on button click', async () => {
    const { onOpenChange } = render()
    await userEvent.click(screen.getByRole('button', { name: /select a project/i }))
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
    await userEvent.type(screen.getByRole('textbox', { name: /search/i }), 'alph')
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('shows "No projects found" when search has no match', async () => {
    await seedProject('Alpha')
    render({ open: true })
    await waitFor(() => screen.getByRole('option', { name: /alpha/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /search/i }), 'zzz')
    expect(screen.getByText(/no projects found/i)).toBeInTheDocument()
  })

  it('calls onSelect and onOpenChange when project is clicked', async () => {
    const project = await seedProject('Alpha')
    const { onSelect, onOpenChange } = render({ open: true })
    await waitFor(() => screen.getByRole('option', { name: /alpha/i }))
    await userEvent.click(screen.getByRole('option', { name: /alpha/i }))
    expect(onSelect).toHaveBeenCalledWith(project.id)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onCreate when "Create project" is clicked', async () => {
    const { onCreate, onOpenChange } = render({ open: true })
    await userEvent.click(screen.getByRole('button', { name: /create project/i }))
    expect(onCreate).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Escape key', async () => {
    const { onOpenChange } = render({ open: true })
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
