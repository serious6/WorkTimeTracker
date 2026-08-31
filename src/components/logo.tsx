import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Brand mark: an open clock face whose gap is filled by a checkmark, tying
 * tracked time to finished work. Strokes use currentColor so the logo follows
 * the surrounding text colour in both themes.
 */
export function AppLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden
      className={cn('size-6', className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M16.7 16.7A8 8 0 1 1 16.7 5.3" />
      <path d="M11 6v5l3 1.8" />
      <path d="m15 15.2 2.4 2.6 4.4-5.6" />
    </svg>
  )
}
