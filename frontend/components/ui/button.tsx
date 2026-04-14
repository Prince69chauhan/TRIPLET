import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "interactive-element inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 motion-reduce:transform-none motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.12),0_10px_22px_rgba(15,23,42,0.12)] hover:bg-primary/92 hover:shadow-[0_1px_0_rgba(255,255,255,0.12),0_14px_28px_rgba(15,23,42,0.14)]',
        destructive:
          'bg-destructive text-white shadow-[0_10px_22px_rgba(127,29,29,0.16)] hover:bg-destructive/92 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border border-border/90 bg-card/92 text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.06)] hover:border-primary/24 hover:bg-accent/86 hover:text-accent-foreground dark:bg-input/75 dark:border-border dark:hover:bg-input',
        secondary:
          'border border-border/70 bg-secondary/96 text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] hover:bg-secondary dark:border-border/80 dark:bg-secondary/92',
        ghost:
          'text-foreground/88 hover:bg-accent/74 hover:text-accent-foreground dark:text-foreground/90 dark:hover:bg-accent/72',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-9 rounded-lg gap-1.5 px-3.5 has-[>svg]:px-3',
        lg: 'h-11 rounded-xl px-6 has-[>svg]:px-4.5',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
