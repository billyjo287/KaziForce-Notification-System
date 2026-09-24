import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-(--radius-card) border border-line bg-surface p-5 sm:p-6 ${className}`}
      {...props}
    />
  );
}
