import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useNavigationStore } from '@/app/navigation'
import { renderWithProviders, resetAppState } from '@/test/harness'
import { AppSidebar } from './app-sidebar'

beforeEach(async () => {
  await resetAppState()
})

describe('AppSidebar', () => {
  test.each([
    'Dashboard',
    'Time Entries',
    'Time Management',
    'Week',
    'Calendar',
    'Reports',
    'Working Time',
    'Projects',
    'Budgets',
    'Absences',
    'Settings',
  ])('renders %s by accessible name when expanded', (label) => {
    renderWithProviders(<AppSidebar />)
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  test.each([
    'Dashboard',
    'Time Entries',
    'Time Management',
    'Week',
    'Calendar',
    'Reports',
    'Working Time',
    'Projects',
    'Budgets',
    'Absences',
    'Settings',
  ])('renders %s by accessible name when collapsed', (label) => {
    useNavigationStore.setState({ sidebarExpanded: false })
    renderWithProviders(<AppSidebar />)
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  test('groups the navigation destinations in a list', () => {
    renderWithProviders(<AppSidebar />)
    expect(screen.getByRole('list').querySelectorAll(':scope > li:not([role])')).toHaveLength(11)
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
    useNavigationStore.setState({ sidebarExpanded: false })
    renderWithProviders(<AppSidebar />)
    const label = screen.getByText('Dashboard')
    expect(label.className).toContain('sr-only')
    expect(label.className).not.toContain('hidden')
  })

  test('persists a user-selected collapsed rail', () => {
    renderWithProviders(<AppSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(useNavigationStore.getState().sidebarExpanded).toBe(false)
    expect(globalThis.localStorage.getItem('work-time-tracker.navigation')).toContain(
      '"sidebarExpanded":false',
    )
  })

  test('shows local data notice', () => {
    renderWithProviders(<AppSidebar />)
    expect(screen.getByText('Local data')).toBeInTheDocument()
  })
})
