import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const styles = cva('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: { default: 'bg-[#183f3a] text-white hover:bg-[#24564f]', outline: 'border border-[#d9ded9] bg-white text-[#263531] hover:bg-[#f2f5f0]', ghost: 'text-[#596763] hover:bg-[#e9eee9]' } },
  defaultVariants: { variant: 'default' },
})

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof styles> {}
export function Button({ className, variant, ...props }: ButtonProps) { return <button className={cn(styles({ variant }), className)} {...props} /> }
