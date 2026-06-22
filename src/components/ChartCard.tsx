import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function ChartCard({ title, description, children, action }: ChartCardProps) {
  return (
    <div className="betfair-card-elevated flex flex-col">
      <div className="flex items-start justify-between border-b border-betfair-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-betfair-navy">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-betfair-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
