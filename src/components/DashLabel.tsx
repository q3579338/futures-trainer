import type { ReactNode } from 'react';

export default function DashLabel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`dash-label text-bn-muted ${className}`}>{children}</span>
  );
}
