
"use client";

import * as React from 'react';
import { cn } from '@/neup.core/helpers/utils';

const fieldOutlineClassName =
  'rounded-xl border border-input bg-background transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/20 focus-visible:ring-offset-0';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, onChange, placeholder, style, value, defaultValue, ...props }, ref) => {
  const localRef = React.useRef<HTMLTextAreaElement>(null);
  const [hasValue, setHasValue] = React.useState(
    () => String(value ?? defaultValue ?? '').length > 0
  );

  const updateTextareaHeight = React.useCallback(() => {
    if (!localRef.current) return;

    const element = localRef.current;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHasValue(event.target.value.length > 0);
    updateTextareaHeight();
    if (onChange) {
      onChange(event);
    }
  };
  
  React.useImperativeHandle(ref, () => localRef.current!);

  React.useEffect(() => {
    setHasValue(String(value ?? defaultValue ?? '').length > 0);
    updateTextareaHeight();
  }, [defaultValue, updateTextareaHeight, value]);

  React.useEffect(() => {
    if (!localRef.current || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateTextareaHeight();
    });

    observer.observe(localRef.current);
    return () => observer.disconnect();
  }, [updateTextareaHeight]);

  const shouldFloatLabel =
    typeof placeholder === 'string' && placeholder.trim().length > 0;

  return (
    <div className="relative w-full">
      <textarea
        className={cn(
          'peer flex min-h-0 w-full px-5 py-3 text-base leading-6 ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none overflow-y-hidden',
          fieldOutlineClassName,
          shouldFloatLabel
            ? 'h-14 min-h-[56px] pt-5 pb-2 placeholder:text-transparent align-top'
            : 'placeholder:text-muted-foreground',
          className
        )}
        ref={localRef}
        onInput={handleInput}
        placeholder={shouldFloatLabel ? ' ' : placeholder}
        value={value}
        defaultValue={defaultValue}
        style={style}
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
