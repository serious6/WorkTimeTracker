import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import entities from '../../../contract/entities.json'
import { absenceAuditSchema, absenceSchema } from '@/features/absences/absence-schema'
import { auditLogEntrySchema, timeEntryAuditSchema } from '@/features/audit/audit-schema'
import { authUserSchema } from '@/features/auth/auth-schema'
import { projectBudgetSchema } from '@/features/budgets/budget-schema'
import { overtimeAuditSchema, overtimeEntrySchema } from '@/features/overtime/overtime-schema'
import { projectSchema } from '@/features/projects/project-schema'
import {
  complianceLimitsSchema,
  workSettingsSchema,
} from '@/features/settings/work-settings-schema'
import { timeEntrySchema } from '@/features/time-entries/time-entry-schema'

type Field = {
  name: string
  type: string
  nullable: boolean
  sample?: unknown
  entity?: string
  defaultsFromNull?: unknown
}

/**
 * `contract/entities.json` is the authority for the shape of every entity that
 * crosses the IPC boundary. `serializes_the_models_of_the_entity_contract` in
 * `src-tauri/src/contract.rs` checks the Rust models against the same file, so a
 * field added on one side only fails one of the two suites.
 */
const contract = entities as unknown as {
  entities: Record<string, { rust: string; zod: string; fields: Field[] }>
}

const schemas: Record<string, z.ZodObject> = {
  user: authUserSchema,
  project: projectSchema,
  timeEntry: timeEntrySchema,
  timeEntryAudit: timeEntryAuditSchema,
  auditLogEntry: auditLogEntrySchema,
  projectBudget: projectBudgetSchema,
  absence: absenceSchema,
  absenceAudit: absenceAuditSchema,
  overtimeEntry: overtimeEntrySchema,
  overtimeAudit: overtimeAuditSchema,
  workSettings: workSettingsSchema,
  complianceLimits: complianceLimitsSchema,
}

const DEFAULTS: Record<string, unknown> = {
  integer: 1,
  string: '2026-08-30T10:00:00.000Z',
  boolean: true,
  array: [],
  object: {},
}

function sampleOf(entity: string): Record<string, unknown> {
  return Object.fromEntries(
    contract.entities[entity].fields.map((field) => [
      field.name,
      field.entity ? sampleOf(field.entity) : (field.sample ?? DEFAULTS[field.type]),
    ]),
  )
}

describe('entity contract', () => {
  it('declares a schema for every entity of the contract', () => {
    expect(Object.keys(schemas).sort()).toEqual(Object.keys(contract.entities).sort())
  })

  it.each(Object.keys(contract.entities))('%s carries the declared fields', (name) => {
    const fields = contract.entities[name].fields

    expect(Object.keys(schemas[name].shape).sort()).toEqual(
      fields.map((field) => field.name).sort(),
    )
    expect(schemas[name].parse(sampleOf(name))).toMatchObject(sampleOf(name))
  })

  it.each(Object.keys(contract.entities))('%s accepts null only where declared', (name) => {
    for (const field of contract.entities[name].fields) {
      const parsed = schemas[name].safeParse({ ...sampleOf(name), [field.name]: null })

      if (field.defaultsFromNull !== undefined) {
        expect(parsed.success, `${name}.${field.name} falls back`).toBe(true)
        expect((parsed.data as Record<string, unknown>)[field.name]).toBe(field.defaultsFromNull)
        continue
      }
      expect(parsed.success, `${name}.${field.name} nullable: ${field.nullable}`).toBe(
        field.nullable,
      )
    }
  })
})
