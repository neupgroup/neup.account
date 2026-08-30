import React from 'react';

type SecondaryHeaderProps = {
  title: string;
  description: string;
  className?: string;
};

export function SecondaryHeader({ title, description, className }: SecondaryHeaderProps) {
  return (
    <div className={className}>
      <h2 className="text-xl font-semibold tracking-tight drop-shadow-[0_-2px_4px_rgba(0,0,0,0.24)]">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
