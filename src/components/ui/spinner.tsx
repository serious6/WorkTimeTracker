import { cn } from '@/lib/utils'

/**
 * Turning indicator for work the user has to wait for. It is decorative: the
 * surrounding element carries the `role="status"` and the text a screen reader
 * announces.
 */
export function Spinner({
  className,
  size = 'default',
}: {
  className?: string
  size?: 'default' | 'sm'
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('boot-spinner', size === 'sm' && 'boot-spinner-sm', className)}
      data-testid="spinner"
    />
  )
}
