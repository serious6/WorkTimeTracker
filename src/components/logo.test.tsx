import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import iconLock from '../../src-tauri/icons/icons.lock.json'
import { AppLogo } from './logo'

const repositoryRoot = join(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(join(repositoryRoot, path))
const digest = (path: string) => createHash('sha256').update(read(path)).digest('hex')

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

test('the icon artwork uses the same mark as the component', () => {
  const { container } = render(<AppLogo />)
  const paths = [...container.querySelectorAll('path')].map((path) => path.getAttribute('d'))

  for (const artwork of Object.keys(iconLock.sources)) {
    for (const d of paths) {
      expect(read(artwork).toString('utf8')).toContain(d)
    }
  }
})

test('the bundled icons were generated from the current artwork', () => {
  for (const [path, hash] of Object.entries({ ...iconLock.sources, ...iconLock.generated })) {
    expect(`${path}:${digest(path)}`).toBe(`${path}:${hash}`)
  }
})
