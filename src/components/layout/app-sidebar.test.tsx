import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useNavigationStore } from '@/app/navigation'
import { renderWithProviders, resetAppState } from '@/test/harness'
import { AppSidebar } from './app-sidebar'

beforeEach(async () => {
  await resetAppState()
})

describe('AppSidebar', () => {
  test('renders all navigation items', () => {
    renderWithProviders(<AppSidebar />)
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  test('marks the active view with aria-current=page', () => {
    useNavigationStore.getState().navigate('settings')
    renderWithProviders(<AppSidebar />)
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  test('navigates when a nav item is clicked', () => {
    renderWithProviders(<AppSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(useNavigationStore.getState().view).toBe('reports')
  })

  test('keeps navigation labels available to assistive technology when collapsed', () => {
    renderWithProviders(<AppSidebar />)
    const label = screen.getByText('Dashboard')
    expect(label.className).toContain('sr-only')
    expect(label.className).not.toContain('hidden')
  })

  test('lists the most used views first and Settings last', () => {
    renderWithProviders(<AppSidebar />)
    const labels = screen
      .getAllByRole('button')
      .map((item) => item.textContent?.trim())
    expect(labels[0]).toBe('Dashboard')
    expect(labels[1]).toBe('Time Entries')
    expect(labels.at(-1)).toBe('Settings')
  })

  test('shows local data notice', () => {
    renderWithProviders(<AppSidebar />)
    expect(screen.getByText('Local data')).toBeInTheDocument()
  })
})
