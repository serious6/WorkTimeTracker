import { z } from '@/lib/zod'

export const DUPLICATE_NOTE_TEMPLATE_MESSAGE = 'A note template with this name already exists'

/**
 * A reusable note text. A template is a source of text only: inserting it
 * copies the text into the note field, so editing or deleting a template never
 * changes a note that was already stored on a record.
 */
export const noteTemplateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  text: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Longest template name, counted like the native validator. */
export const MAX_NOTE_TEMPLATE_NAME = 100
/** The text lands in a note, so it obeys the note limit of a time entry. */
export const MAX_NOTE_TEMPLATE_TEXT = 500

/**
 * Length in Unicode scalar values, the unit `SaveNoteTemplate::validate` counts
 * in `src-tauri/src/models.rs`. `String.length` counts UTF-16 code units, so an
 * astral character such as an emoji would otherwise count twice in the browser
 * and once in the app, and the two repositories would disagree.
 */
function codePoints(value: string): number {
  return [...value].length
}

export const saveNoteTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Template name is required')
    .refine((name) => codePoints(name) <= MAX_NOTE_TEMPLATE_NAME, 'Template name is too long'),
  text: z
    .string()
    .trim()
    .min(1, 'Template text is required')
    .refine((text) => codePoints(text) <= MAX_NOTE_TEMPLATE_TEXT, 'Template text is too long'),
})

export type NoteTemplate = z.infer<typeof noteTemplateSchema>
export type SaveNoteTemplate = z.infer<typeof saveNoteTemplateSchema>
