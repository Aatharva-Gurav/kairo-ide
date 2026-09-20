import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2.5 py-0.5 text-xs transition-colors outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/30 dark:bg-input/25 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
