import * as React from "react"

import { cn } from "@/core/helpers/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, placeholder, onChange, value, defaultValue, ...props }, ref) => {
    const localRef = React.useRef<HTMLInputElement | null>(null)
    const [hasValue, setHasValue] = React.useState(
      () => String(value ?? defaultValue ?? "").length > 0
    )

    React.useImperativeHandle(ref, () => localRef.current as HTMLInputElement)

    React.useEffect(() => {
      setHasValue(String(value ?? defaultValue ?? "").length > 0)
    }, [defaultValue, value])

    if (type === "hidden" || type === "file") {
      return (
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-2",
            className
          )}
          ref={ref}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          {...props}
        />
      )
    }

    const shouldFloatLabel =
      typeof placeholder === "string" && placeholder.trim().length > 0

    return (
      <div className="relative w-full">
        <input
          type={type}
          onChange={(event) => {
            setHasValue(event.target.value.length > 0)
            onChange?.(event)
          }}
          className={cn(
            "peer flex h-10 w-full rounded-xl border border-input bg-background px-5 py-3 text-base leading-6 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm transition-colors",
            shouldFloatLabel
              ? "h-14 pt-5 pb-2 placeholder:text-transparent hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 focus-visible:ring-offset-0"
              : "placeholder:text-muted-foreground hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 focus-visible:ring-offset-0",
            className
          )}
          placeholder={shouldFloatLabel ? " " : placeholder}
          ref={localRef}
          value={value}
          defaultValue={defaultValue}
          {...props}
        />
        {shouldFloatLabel ? (
          <span
            className={cn(
              "pointer-events-none absolute left-4 bg-background px-1 text-muted-foreground transition-all duration-200 ease-out",
              hasValue
                ? "top-0 -translate-y-1/2 text-xs font-medium text-ring"
                : "top-1/2 -translate-y-1/2 text-base",
              "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:font-medium peer-focus:text-ring"
            )}
          >
            {placeholder}
          </span>
        ) : null}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
