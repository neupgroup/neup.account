import * as React from "react"

import { cn } from "@/core/utils"

const fieldOutlineClassName =
  "rounded-xl border border-input bg-background transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/20 focus-visible:ring-offset-0"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm",
          fieldOutlineClassName,
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
