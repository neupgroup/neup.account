import React from 'react';

type PrimaryHeaderProps = {
  title: string;
  description: string;
  className?: string;
};

export function PrimaryHeader({ title, description, className }: PrimaryHeaderProps) {
  return (
    <div className={className}>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
