import React from 'react';

type TertiaryHeaderProps = {
  title: string;
  description?: string;
  className?: string;
};

export function TertiaryHeader({ title, description, className }: TertiaryHeaderProps) {
  return (
    <div className={className}>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
