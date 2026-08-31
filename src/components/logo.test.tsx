import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppLogo } from './logo'

test('renders a decorative mark that inherits the text colour', () => {
  const { container } = render(<AppLogo />)
  const svg = container.querySelector('svg')

  expect(svg).not.toBeNull()
  expect(svg).toHaveAttribute('aria-hidden', 'true')
  expect(svg).toHaveAttribute('stroke', 'currentColor')
  expect(svg?.querySelectorAll('path')).toHaveLength(3)
})

test('accepts sizing classes from the caller', () => {
  const { container } = render(<AppLogo className="size-7 text-primary" />)

  const svg = container.querySelector('svg')

  expect(svg).toHaveClass('size-7', 'text-primary')
  expect(svg).not.toHaveClass('size-6')
})
