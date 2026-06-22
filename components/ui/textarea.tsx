
"use client";

import * as React from 'react';
import { cn } from '@/core/helpers/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, onChange, placeholder, value, defaultValue, ...props }, ref) => {
  const localRef = React.useRef<HTMLTextAreaElement>(null);
  const [hasValue, setHasValue] = React.useState(
    () => String(value ?? defaultValue ?? '').length > 0
  );

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (localRef.current) {
      localRef.current.style.height = 'auto';
      localRef.current.style.height = `${localRef.current.scrollHeight}px`;
    }
    setHasValue(event.target.value.length > 0);
    if (onChange) {
      onChange(event);
    }
  };
  
  React.useImperativeHandle(ref, () => localRef.current!);

  React.useEffect(() => {
    if (localRef.current) {
      localRef.current.style.height = 'auto';
      localRef.current.style.height = `${localRef.current.scrollHeight}px`;
    }
    setHasValue(String(value ?? defaultValue ?? '').length > 0);
  }, [defaultValue, value]);

  const shouldFloatLabel =
    typeof placeholder === 'string' && placeholder.trim().length > 0;

  return (
    <div className="relative w-full">
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-xl border border-input bg-background px-5 py-3 text-base leading-6 ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none overflow-y-hidden transition-colors',
          shouldFloatLabel
            ? 'min-h-[64px] pt-5 pb-2 placeholder:text-transparent'
            : 'placeholder:text-muted-foreground',
          className
        )}
        ref={localRef}
        onInput={handleInput}
        placeholder={shouldFloatLabel ? ' ' : placeholder}
        value={value}
        defaultValue={defaultValue}
        {...props}
      />
      {shouldFloatLabel ? (
        <span
          className={cn(
            'pointer-events-none absolute left-4 bg-background px-1 text-muted-foreground transition-all duration-200 ease-out',
            hasValue
              ? 'top-0 -translate-y-1/2 text-xs font-medium text-ring'
              : 'top-1/2 -translate-y-1/2 text-base',
            'peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:font-medium peer-focus:text-ring'
          )}
        >
          {placeholder}
        </span>
      ) : null}
    </div>
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
