import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Menu } from './menu'

function renderMenu(items = [
  { label: 'Edit', onSelect: vi.fn() },
  { label: 'Delete', onSelect: vi.fn(), destructive: true },
]) {
  render(<Menu items={items} label="Options menu" trigger={<span>⋯</span>} />)
  return items
}

beforeEach(() => vi.clearAllMocks())

describe('Menu', () => {
  test('is closed initially and trigger has aria-expanded=false', () => {
    renderMenu()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Options menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  test('opens when trigger is clicked', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Options menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  test('closes when trigger is clicked again', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Options menu' })
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('calls onSelect and closes menu when item is clicked', () => {
    const items = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Options menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(items[0].onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('closes on Escape key', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Options menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('closes when clicking outside', () => {
    render(
      <div>
        <Menu items={[{ label: 'X', onSelect: vi.fn() }]} label="Menu" trigger={<span>T</span>} />
        <button type="button">Outside</button>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
