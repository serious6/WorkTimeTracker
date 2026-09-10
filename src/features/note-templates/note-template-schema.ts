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

export const saveNoteTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(100),
  /** The text lands in a note, so it obeys the note limit of a time entry. */
  text: z.string().trim().min(1, 'Template text is required').max(500),
})

export type NoteTemplate = z.infer<typeof noteTemplateSchema>
export type SaveNoteTemplate = z.infer<typeof saveNoteTemplateSchema>
