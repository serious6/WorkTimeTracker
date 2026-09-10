import { useId } from 'react'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useNoteTemplates } from '../note-template-queries'

/**
 * A note field that accepts free text and, next to it, offers the reusable
 * note templates. Picking a template copies its text into the field, where it
 * stays editable: the note is stored as plain text, so a template that is
 * edited or deleted later never changes a note that was already saved.
 */
export function NoteField({
  value,
  onChange,
  label = 'Note',
  name = 'note',
  placeholder,
  error,
  multiline = false,
  maxLength,
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  name?: string
  placeholder?: string
  error?: string
  multiline?: boolean
  maxLength?: number
}) {
  const { data: templates = [] } = useNoteTemplates()
  const pickerId = useId()

  return (
    <div className="space-y-2">
      <Field error={error} label={label}>
        {multiline ? (
          <Textarea
            maxLength={maxLength}
            name={name}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            value={value}
          />
        ) : (
          <Input
            maxLength={maxLength}
            name={name}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            value={value}
          />
        )}
      </Field>
      {templates.length > 0 && (
        <div className="space-y-1">
          <label className="sr-only" htmlFor={pickerId}>
            Insert note template
          </label>
          <Select
            id={pickerId}
            onChange={(event) => {
              const template = templates.find(
                (candidate) => `${candidate.id}` === event.target.value,
              )
              if (template) onChange(template.text)
              // The picker is an action, not a value: it returns to its
              // placeholder so the same template can be inserted again.
              event.target.value = ''
            }}
            value=""
          >
            <option value="">Insert a note template…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  )
}
