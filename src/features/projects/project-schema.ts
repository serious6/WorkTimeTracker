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
})

export type Project = z.infer<typeof projectSchema>
export type SaveProject = z.infer<typeof saveProjectSchema>

export function nextProjectColor(projects: Project[]): string {
  return PROJECT_COLORS[projects.length % PROJECT_COLORS.length]
}
