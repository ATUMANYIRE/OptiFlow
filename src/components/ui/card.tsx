import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn('rounded-2xl border border-[#e4e9e2] bg-white shadow-[0_2px_12px_rgba(19,46,38,0.035)]', className)} {...props} /> }
