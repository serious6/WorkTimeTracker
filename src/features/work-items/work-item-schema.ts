import { z } from 'zod'

export const WORK_ITEM_KIND_FLEXTIME_COMPENSATION = 'flextime_compensation'
export const WORK_ITEM_KIND_UNPAID_LEAVE = 'unpaid_leave'
export const WORK_ITEM_KIND_SICKNESS = 'sickness'
export const WORK_ITEM_KIND_TRAINING = 'training'
export const WORK_ITEM_KIND_PROJECT = 'project'

export const workItemKindSchema = z.enum([
  WORK_ITEM_KIND_FLEXTIME_COMPENSATION,
  WORK_ITEM_KIND_UNPAID_LEAVE,
  WORK_ITEM_KIND_SICKNESS,
  WORK_ITEM_KIND_TRAINING,
  WORK_ITEM_KIND_PROJECT,
])

export type WorkItemKind = z.infer<typeof workItemKindSchema>

/** Preset kinds are seeded once per user and cannot be created again. */
export const WORK_ITEM_PRESET_KINDS: readonly WorkItemKind[] = [
  WORK_ITEM_KIND_FLEXTIME_COMPENSATION,
  WORK_ITEM_KIND_UNPAID_LEAVE,
  WORK_ITEM_KIND_SICKNESS,
  WORK_ITEM_KIND_TRAINING,
]

export const WORK_ITEM_KIND_LABELS: Record<WorkItemKind, string> = {
  [WORK_ITEM_KIND_FLEXTIME_COMPENSATION]: 'Flextime Compensation',
  [WORK_ITEM_KIND_UNPAID_LEAVE]: 'Unpaid leave of absence',
  [WORK_ITEM_KIND_SICKNESS]: 'Sickness',
  [WORK_ITEM_KIND_TRAINING]: 'Training',
  [WORK_ITEM_KIND_PROJECT]: 'Project',
}

export const workItemSchema = z.object({
  id: z.number().int().positive(),
  kind: workItemKindSchema,
  name: z.string(),
  costCenter: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const saveWorkItemSchema = z
  .object({
    kind: workItemKindSchema,
    name: z.string().trim().min(1, 'Work item name is required').max(100),
    costCenter: z
      .string()
      .trim()
      .max(100)
      .nullish()
      .transform((value) => value || null),
    active: z.boolean().optional().default(true),
  })
  .refine((item) => item.kind === WORK_ITEM_KIND_PROJECT || item.costCenter === null, {
    message: 'Only a project work item carries a cost center',
    path: ['costCenter'],
  })

export type WorkItem = z.infer<typeof workItemSchema>
export type SaveWorkItem = z.infer<typeof saveWorkItemSchema>

export function isProjectWorkItem(item: { kind: WorkItemKind }): boolean {
  return item.kind === WORK_ITEM_KIND_PROJECT
}
