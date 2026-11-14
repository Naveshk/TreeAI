import { useEffect, useId, useRef, type ReactNode } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { Button, cx, inputBaseClass } from "./primitives";

// ---- Tabs -------------------------------------------------------------------------------
export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-navy-600">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cx(
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              selected
                ? "border-teal-400 text-teal-200"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- Pagination -------------------------------------------------------------------------
export function Pagination({
  offset,
  limit,
  total,
  pageSizes,
  onChange,
  busy,
}: {
  offset: number;
  limit: number;
  total: number;
  pageSizes: number[];
  onChange: (offset: number, limit: number) => void;
  busy?: boolean;
}) {
  const sizeId = useId();
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
      <p className="tabular" aria-live="polite">
        Rows {first}–{last} of {total.toLocaleString("en-US")}
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor={sizeId} className="text-xs">
          Rows per page
        </label>
        <select
          id={sizeId}
          value={limit}
          onChange={(e) => onChange(0, Number(e.target.value))}
          className={cx(inputBaseClass, "h-8 w-20")}
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Previous page"
          disabled={offset === 0 || busy}
          onClick={() => onChange(Math.max(0, offset - limit), limit)}
        >
          <ChevronLeftIcon /> Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Next page"
          disabled={offset + limit >= total || busy}
          onClick={() => onChange(offset + limit, limit)}
        >
          Next <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}

// ---- ConfirmDialog ----------------------------------------------------------------------
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (!firstEl || !lastEl) return;
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-navy-500 bg-navy-800 p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        <div className="mt-2 text-sm text-ink-muted">{children}</div>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- BarList: horizontal bars for real values (probabilities, votes, missing %) ---------
export function BarList({
  items,
  max,
  format,
  label,
}: {
  items: { label: string; value: number; color?: string; highlight?: boolean }[];
  max: number;
  format: (value: number) => string;
  label: string;
}) {
  return (
    <ul aria-label={label} className="space-y-2.5">
      {items.map((item) => {
        const width = max > 0 ? Math.max(0, Math.min(100, (item.value / max) * 100)) : 0;
        return (
          <li key={item.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className={cx("truncate", item.highlight ? "font-semibold text-ink" : "text-ink-muted")}>
                {item.label}
              </span>
              <span className="tabular shrink-0 text-ink">{format(item.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-navy-600">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, backgroundColor: item.color ?? "var(--color-teal-400)" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
