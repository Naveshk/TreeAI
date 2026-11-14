import { BRAND_NAME } from "../../config/site";

/** Temporary logo mark. Replace this single component to rebrand. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0f2a33" />
      <path d="M16 8v6M16 14l-6 6M16 14l6 6" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="8" r="3" fill="#2dd4bf" />
      <circle cx="10" cy="22" r="3" fill="#5eead4" />
      <circle cx="22" cy="22" r="3" fill="#99f6e4" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-base font-semibold tracking-tight text-ink">{BRAND_NAME}</span>
    </span>
  );
}
