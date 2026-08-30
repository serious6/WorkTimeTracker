import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary-strong text-primary-foreground hover:bg-primary-strong/90',
        outline: 'border border-input bg-transparent hover:bg-muted',
        ghost: 'bg-transparent hover:bg-muted',
        subtle: 'bg-muted text-foreground hover:bg-muted/70',
        destructive: 'bg-destructive-strong text-primary-foreground hover:bg-destructive-strong/90',
        link: 'bg-transparent text-primary hover:underline',
      },
      // Every size keeps a 40px minimum hit area (Fitts's Law). `sm` and `inline`
      // are shorter than that, so a transparent pseudo element extends their hit
      // area vertically; their width already exceeds 40px through padding and label.
      size: {
        default: 'h-10 px-4',
        sm: "relative h-8 px-3 text-xs after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        icon: 'size-10',
        inline: "relative h-6 text-xs after:absolute after:-inset-x-2 after:-inset-y-2 after:content-['']",
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} type={type} {...props} />
  )
}
