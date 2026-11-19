import type { ComponentProps } from "react"
import { cn } from "@/web/lib/utils"

/**
 * Renders the shadcn/ui input with the care desk's focus and border colors.
 */
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input type={type} data-slot="input" className={cn(
      "h-11 w-full min-w-0 rounded-md border border-line bg-white px-3 text-base outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent md:text-sm",
      className,
    )} {...props} />
  )
}
