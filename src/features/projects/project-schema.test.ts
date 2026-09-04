import { describe, expect, it } from 'vitest'
import {
  nextProjectColor,
  PROJECT_COLORS,
  projectSchema,
  saveProjectSchema,
  selectableProjects,
  type Project,
} from './project-schema'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: 'Test',
    description: null,
    color: '#22c55e',
    active: true,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('nextProjectColor', () => {
  it('returns the first color when no projects exist', () => {
    expect(nextProjectColor([])).toBe(PROJECT_COLORS[0])
  })

  it('cycles through all colors', () => {
    const projects = PROJECT_COLORS.map((_, index) => makeProject({ id: index + 1 }))
    projects.forEach((_, index) => {
      expect(nextProjectColor(projects.slice(0, index))).toBe(PROJECT_COLORS[index % PROJECT_COLORS.length])
    })
  })

  it('wraps around after all colors are used', () => {
    const projects = Array.from({ length: PROJECT_COLORS.length }, (_, i) => makeProject({ id: i + 1 }))
    expect(nextProjectColor(projects)).toBe(PROJECT_COLORS[0])
  })
})

describe('saveProjectSchema', () => {
  it('accepts a valid project', () => {
    const result = saveProjectSchema.safeParse({ name: 'Alpha', color: '#22c55e', active: true })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = saveProjectSchema.safeParse({ name: '', color: '#22c55e', active: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/required/i)
  })

  it('rejects a name that is too long', () => {
    const result = saveProjectSchema.safeParse({ name: 'x'.repeat(101), color: '#22c55e', active: true })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid color hex', () => {
    const result = saveProjectSchema.safeParse({ name: 'X', color: 'red', active: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/color/i)
  })

  it('accepts a valid 6-digit hex color', () => {
    const result = saveProjectSchema.safeParse({ name: 'X', color: '#abcdef', active: true })
    expect(result.success).toBe(true)
  })

  it('trims the name', () => {
    const result = saveProjectSchema.parse({ name: '  Trimmed  ', color: '#22c55e', active: true })
    expect(result.name).toBe('Trimmed')
  })

  it('coerces empty description to null', () => {
    const result = saveProjectSchema.parse({ name: 'X', description: '', color: '#22c55e', active: true })
    expect(result.description).toBeNull()
  })

  it('keeps a non-empty description', () => {
    const result = saveProjectSchema.parse({ name: 'X', description: 'A desc', color: '#22c55e', active: true })
    expect(result.description).toBe('A desc')
  })

  it('rejects description longer than 500 chars', () => {
    const result = saveProjectSchema.safeParse({ name: 'X', description: 'x'.repeat(501), color: '#22c55e' })
    expect(result.success).toBe(false)
  })

  it('defaults active to true when omitted', () => {
    const result = saveProjectSchema.parse({ name: 'X', color: '#22c55e' })
    expect(result.active).toBe(true)
  })

  it('defaults archived to false when omitted', () => {
    const result = saveProjectSchema.parse({ name: 'X', color: '#22c55e' })
    expect(result.archived).toBe(false)
  })
})

describe('projectSchema', () => {
  it('reads a project written before archiving existed as not archived', () => {
    const { archived: _archived, ...stored } = makeProject()

    expect(projectSchema.parse(stored).archived).toBe(false)
  })
})

describe('selectableProjects', () => {
  it('leaves archived projects out', () => {
    const projects = [makeProject(), makeProject({ id: 2, name: 'Old', archived: true })]

    expect(selectableProjects(projects).map((project) => project.id)).toEqual([1])
  })

  it('keeps the archived project that is already selected', () => {
    const projects = [makeProject(), makeProject({ id: 2, name: 'Old', archived: true })]

    expect(selectableProjects(projects, 2).map((project) => project.id)).toEqual([1, 2])
  })
})
