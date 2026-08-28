import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins class names and drops falsy values', () => {
    expect(cn('px-2', undefined, false && 'hidden', 'py-1')).toBe('px-2 py-1')
  })

  it('lets the later tailwind class win over the earlier one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('keeps conditional classes from objects and arrays', () => {
    expect(cn(['flex', { hidden: false, 'gap-2': true }])).toBe('flex gap-2')
  })
})
