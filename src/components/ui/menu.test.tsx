import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Menu } from './menu'

function renderMenu(items = [
  { label: 'Edit', onSelect: vi.fn() },
  { label: 'Delete', onSelect: vi.fn(), destructive: true },
]) {
  render(<Menu items={items} label="Options menu" trigger={<span>⋯</span>} />)
  return items
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Menu', () => {
  test('is closed initially and trigger button has aria-expanded=false', () => {
    renderMenu()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Options menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  test('opens when trigger is clicked', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Options menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  test('closes when trigger is clicked again', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Options menu' })
    await user.click(trigger)
    await user.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('calls onSelect and closes menu when item is clicked', async () => {
    const user = userEvent.setup()
    const items = renderMenu()
    await user.click(screen.getByRole('button', { name: 'Options menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(items[0].onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('closes on Escape key', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Options menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('closes when clicking outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <Menu items={[{ label: 'X', onSelect: vi.fn() }]} label="Menu" trigger={<span>T</span>} />
        <button type="button">Outside</button>
      </div>,
    )
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
