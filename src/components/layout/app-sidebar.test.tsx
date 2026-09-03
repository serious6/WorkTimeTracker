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
    'Overtime',
    'Audit Trails',
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
    'Overtime',
    'Audit Trails',
    'Settings',
  ])('renders %s by accessible name when collapsed', (label) => {
    useNavigationStore.setState({ sidebarExpanded: false })
    renderWithProviders(<AppSidebar />)
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  test('groups the navigation destinations in a list', () => {
    renderWithProviders(<AppSidebar />)
    expect(screen.getByRole('list').querySelectorAll(':scope > li:not([role])')).toHaveLength(13)
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

  test('groups Audit Trails under Audit, between Manage and Settings', () => {
    renderWithProviders(<AppSidebar />)
    const labels = [...screen.getByRole('list').children].map((item) => item.textContent)

    expect(screen.getByRole('heading', { name: 'Audit' })).toBeInTheDocument()
    expect(labels.indexOf('Audit')).toBeGreaterThan(labels.indexOf('Manage'))
    expect(labels.indexOf('Audit Trails')).toBe(labels.indexOf('Audit') + 1)
    expect(labels.indexOf('Settings')).toBe(labels.indexOf('Audit Trails') + 1)
  })

  test('navigates to the audit trails view', () => {
    renderWithProviders(<AppSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Audit Trails' }))
    expect(useNavigationStore.getState().view).toBe('audit-trails')
    expect(screen.getByRole('button', { name: 'Audit Trails' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('keeps navigation labels available to assistive technology when collapsed', () => {
    useNavigationStore.setState({ sidebarExpanded: false })
    renderWithProviders(<AppSidebar />)
    const label = screen.getByText('Dashboard')
    expect(label.className).toContain('sr-only')
    expect(label.className).not.toContain('hidden')
  })

  test('left-aligns the nav items on one icon column when expanded', () => {
    renderWithProviders(<AppSidebar />)
    for (const label of ['Dashboard', 'Time Management', 'Settings']) {
      const item = screen.getByRole('button', { name: label })
      expect(item.className).toContain('justify-start')
      expect(item.className).not.toContain('justify-center')
      expect(item.className).toContain('px-3')
      expect(item.className).toContain('min-h-10')
      expect(item.querySelector('svg')?.getAttribute('class')).toContain('shrink-0')
    }
  })

  test('centres the nav icons in the collapsed rail', () => {
    useNavigationStore.setState({ sidebarExpanded: false })
    renderWithProviders(<AppSidebar />)
    for (const label of ['Dashboard', 'Time Management', 'Settings']) {
      const item = screen.getByRole('button', { name: label })
      expect(item.className).toContain('justify-center')
      expect(item.className).not.toContain('justify-start')
      expect(item.className).toContain('min-h-10')
    }
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
