import type { ComponentPropsWithRef, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
export { cx };

// ---- buttons ----------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-teal-400 text-navy-950 hover:bg-teal-300 disabled:bg-teal-400/40",
  secondary:
    "bg-navy-700 text-ink ring-1 ring-inset ring-navy-500 hover:bg-navy-600 disabled:opacity-50",
  ghost: "text-ink-muted hover:bg-navy-700 hover:text-ink disabled:opacity-50",
  danger: "bg-rose-500 text-white hover:bg-rose-400 disabled:bg-rose-500/40",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
    "disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ---- surfaces ---------------------------------------------------------------------------
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl border border-navy-600 bg-navy-800", className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-600 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">{eyebrow}</p>
        )}
        <h1 className="mt-1 truncate text-2xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---- small elements ---------------------------------------------------------------------
type Tone = "neutral" | "teal" | "amber" | "rose" | "sky" | "violet" | "green";
const TONES: Record<Tone, string> = {
  neutral: "bg-navy-700 text-ink-muted ring-navy-500",
  teal: "bg-teal-400/10 text-teal-300 ring-teal-400/30",
  amber: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  rose: "bg-rose-400/10 text-rose-300 ring-rose-400/30",
  sky: "bg-sky-400/10 text-sky-300 ring-sky-400/30",
  violet: "bg-violet-400/10 text-violet-300 ring-violet-400/30",
  green: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        className ?? TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}

type AlertTone = "info" | "success" | "warning" | "error";
const ALERT_STYLES: Record<AlertTone, string> = {
  info: "border-sky-400/30 bg-sky-400/5 text-sky-100",
  success: "border-emerald-400/30 bg-emerald-400/5 text-emerald-100",
  warning: "border-amber-400/30 bg-amber-400/5 text-amber-100",
  error: "border-rose-400/40 bg-rose-400/5 text-rose-100",
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const IconCmp = tone === "success" ? CheckIcon : tone === "info" ? InfoIcon : AlertIcon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex gap-3 rounded-lg border px-4 py-3 text-sm", ALERT_STYLES[tone])}
    >
      <IconCmp className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cx(title ? "mt-1" : "", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-navy-600 bg-navy-800 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-2 w-full overflow-hidden rounded-full bg-navy-600"
    >
      <div className="h-full rounded-full bg-teal-400 transition-[width]" style={{ width: `${value}%` }} />
    </div>
  );
}

// ---- forms ------------------------------------------------------------------------------
export const inputBaseClass =
  "rounded-lg border border-navy-500 bg-navy-900 px-3 text-sm text-ink " +
  "placeholder:text-ink-faint focus:border-teal-400 focus:outline-none disabled:opacity-50";
export const inputClass = `h-10 w-full ${inputBaseClass}`;

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-300">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>
      )}
    </div>
  );
}
