import type { ReactNode } from "react";

import { userMessage } from "../../api/client";
import { Button, Spinner } from "./primitives";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-ink-muted">
      <Spinner className="text-teal-300" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-navy-700 text-teal-300">
          {icon}
        </div>
      )}
      <p className="text-base font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  title = "Something went wrong",
  onRetry,
  action,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-base font-medium text-rose-200">{title}</p>
      <p className="mt-1 max-w-lg text-sm text-ink-muted">{userMessage(error)}</p>
      <div className="mt-5 flex gap-2">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}
