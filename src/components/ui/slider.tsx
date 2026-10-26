import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../../lib/utils'

export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return <SliderPrimitive.Root className={cn('relative flex h-6 w-full touch-none select-none items-center', className)} {...props}>
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[#e0e8df]">
      <SliderPrimitive.Range className="absolute h-full bg-[#367b6b]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-[3px] border-white bg-[#327967] shadow-[0_1px_7px_#98b2a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" />
  </SliderPrimitive.Root>
}
