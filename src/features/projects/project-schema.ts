import { z } from '@/lib/zod'

export const PROJECT_COLORS = [
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#eab308',
  '#ec4899',
  '#ef4444',
] as const

export const projectSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  color: z.string(),
  active: z.boolean(),
  /** Rows written before archiving existed carry no flag and are not archived. */
  archived: z
    .boolean()
    .nullish()
    .transform((value) => value ?? false),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const saveProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value || null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a project color'),
  active: z.boolean().optional().default(true),
  archived: z.boolean().optional().default(false),
})

export type Project = z.infer<typeof projectSchema>
export type SaveProject = z.infer<typeof saveProjectSchema>

/**
 * The projects that may be selected for tracking. Archived projects are left
 * out, except the one already selected: an entry keeps the project it was
 * booked on, and a running timer keeps naming its project.
 */
export function selectableProjects(projects: Project[], selectedId?: number | null): Project[] {
  return projects.filter((project) => !project.archived || project.id === selectedId)
}

export function nextProjectColor(projects: Project[]): string {
  return PROJECT_COLORS[projects.length % PROJECT_COLORS.length]
}
