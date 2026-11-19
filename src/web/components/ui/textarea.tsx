import type { ComponentProps } from "react"
import { cn } from "@/web/lib/utils"

/**
 * Renders the shadcn/ui textarea with the shared input focus treatment.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn("w-full min-w-0 focus-visible:ring-2 focus-visible:ring-accent", className)} {...props} />
}
