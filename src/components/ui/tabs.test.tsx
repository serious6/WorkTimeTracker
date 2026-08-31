import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

function renderTabs() {
  render(
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="work-items">Work items</TabsTrigger>
      </TabsList>
      <TabsContent value="general">General content</TabsContent>
      <TabsContent value="work-items">Work items content</TabsContent>
    </Tabs>,
  )
}

describe('Tabs', () => {
  test('shows the default tab content and hides the other panel', () => {
    renderTabs()
    expect(screen.getByText('General content')).toBeInTheDocument()
    expect(screen.queryByText('Work items content')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Work items' })).toHaveAttribute('aria-selected', 'false')
  })

  test('switches content when another tab is clicked', () => {
    renderTabs()
    fireEvent.click(screen.getByRole('tab', { name: 'Work items' }))
    expect(screen.getByText('Work items content')).toBeInTheDocument()
    expect(screen.queryByText('General content')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Work items' })).toHaveAttribute('aria-selected', 'true')
  })

  test('throws when a trigger is rendered outside of Tabs', () => {
    expect(() => render(<TabsTrigger value="x">X</TabsTrigger>)).toThrow(/must be used inside/)
  })
})
