import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 disabled:pointer-events-none disabled:opacity-45', {
  variants: {
    variant: {
      primary: 'bg-lime-300 text-zinc-950 hover:bg-lime-200',
      secondary: 'border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800',
      ghost: 'text-zinc-400 hover:bg-zinc-800 hover:text-white',
      light: 'bg-white text-zinc-950 hover:bg-lime-200',
    },
    size: { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4', lg: 'h-12 px-5' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
})
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
})
Button.displayName = 'Button'

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(({ className, label, ...props }, ref) => (
  <button ref={ref} type="button" aria-label={label} title={label} className={cn('inline-grid h-9 w-9 place-items-center rounded-full border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300', className)} {...props} />
))
IconButton.displayName = 'IconButton'

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[.16em] text-zinc-400', className)}>{children}</span>
}
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-2xl shadow-black/20', className)}>{children}</div>
}
