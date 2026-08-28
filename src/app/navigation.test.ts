import { beforeEach, describe, expect, it } from 'vitest'
import { useNavigationStore } from './navigation'

beforeEach(() => {
  useNavigationStore.setState({ view: 'dashboard', projectFilter: null, dateFilter: null })
})

describe('navigation store', () => {
  it('starts on the dashboard without filters', () => {
    const { view, projectFilter, dateFilter } = useNavigationStore.getState()

    expect(view).toBe('dashboard')
    expect(projectFilter).toBeNull()
    expect(dateFilter).toBeNull()
  })

  it('carries filters to the target view', () => {
    const dateFilter = new Date(2026, 7, 28)

    useNavigationStore.getState().navigate('time-entries', { projectFilter: 7, dateFilter })

    expect(useNavigationStore.getState()).toMatchObject({
      view: 'time-entries',
      projectFilter: 7,
      dateFilter,
    })
  })

  it('drops the filters of the previous view when navigating without options', () => {
    useNavigationStore.getState().navigate('time-entries', { projectFilter: 7 })
    useNavigationStore.getState().navigate('reports')

    expect(useNavigationStore.getState()).toMatchObject({
      view: 'reports',
      projectFilter: null,
      dateFilter: null,
    })
  })

  it('keeps a filter that is cleared explicitly', () => {
    useNavigationStore.getState().navigate('time-entries', { projectFilter: 7 })
    useNavigationStore.getState().navigate('time-entries', { projectFilter: null })

    expect(useNavigationStore.getState().projectFilter).toBeNull()
  })
})
