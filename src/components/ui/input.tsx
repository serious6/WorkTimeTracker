import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

const fieldClasses =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, className)} {...props} />
}

/**
 * Deviation from the custom-styled kit (principle 3, docs/ui-principles.md): `Select` renders a native
 * `<select>` instead of a hand-built listbox so it keeps the OS picker on mobile and free keyboard
 * navigation, at the cost of limited style control over the open menu.
 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClasses, 'cursor-pointer', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClasses, 'h-20 resize-none', className)} {...props} />
}

const checkboxClasses =
  'size-4 shrink-0 cursor-pointer accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50'

/**
 * Checkbox field so option lists share the focus ring and accent of the other inputs. Pass
 * `label` to render the text next to it in a row that meets the 40 px Fitts's Law hit area
 * (matching the working-day checkboxes on the settings page); omit it to keep the bare control,
 * e.g. when the caller supplies its own label markup.
 */
export function Checkbox({
  className,
  label,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode }) {
  const generatedId = useId()
  const controlId = label ? (id ?? generatedId) : id
  const control = (
    <input className={cn(checkboxClasses, className)} id={controlId} {...props} type="checkbox" />
  )
  if (!label) return control
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm" htmlFor={controlId}>
      {control}
      {label}
    </label>
  )
}

type FieldControlProps = {
  id: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/**
 * Wraps a control with its label and optional hint or error, wiring the
 * accessible ids without changing the standalone input primitives.
 */
export function Field({
  label,
  hint,
  error,
  id,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  id?: string
  className?: string
  children: ReactElement<Partial<FieldControlProps>>
}) {
  const generatedId = useId()
  const controlId = id ?? (isValidElement(children) ? children.props.id : undefined) ?? generatedId
  const hintId = hint && !error ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy =
    [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = cloneElement(children, {
    id: controlId,
    'aria-invalid': error ? true : children.props['aria-invalid'],
    'aria-describedby': describedBy,
  })

  return (
    <div className={cn('space-y-1', className)}>
      <label className="block text-sm font-medium" htmlFor={controlId}>
        {label}
      </label>
      {control}
      {hint && !error && (
        <p className="text-sm text-muted-foreground" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
