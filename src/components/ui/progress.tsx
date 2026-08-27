import { cn } from '@/lib/utils'

export function Progress({
  value,
  className,
  indicatorClassName,
  label,
}: {
  value: number
  className?: string
  indicatorClassName?: string
  label?: string
}) {
  const percentage = Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percentage}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
    >
      <div
        className={cn('h-full rounded-full bg-primary transition-all', indicatorClassName)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}
