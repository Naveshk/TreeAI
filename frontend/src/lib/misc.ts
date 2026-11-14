import type { ColumnKind } from "../api/types";
import { MAX_UPLOAD_BYTES } from "../config/limits";
import { formatBytes } from "./format";

/** "Ada Lovelace" -> "AL", "Team Member 1" -> "TM". */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .map((word) => word[0]!.toUpperCase());
  return letters.slice(0, 2).join("") || "?";
}

export const COLUMN_KINDS: Record<ColumnKind, { label: string; description: string; className: string }> =
  {
    numeric: {
      label: "Numeric",
      description: "Numbers; used directly by the trees' threshold splits.",
      className: "bg-sky-400/10 text-sky-300 ring-sky-400/30",
    },
    categorical: {
      label: "Categorical",
      description: "A limited set of text values; encoded as categories.",
      className: "bg-violet-400/10 text-violet-300 ring-violet-400/30",
    },
    boolean: {
      label: "Boolean",
      description: "Two values such as yes/no; treated as categorical.",
      className: "bg-teal-400/10 text-teal-300 ring-teal-400/30",
    },
    datetime: {
      label: "Date/time",
      description: "ISO-8601 dates; shown for exploration, not used as features.",
      className: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
    },
    text: {
      label: "Text",
      description: "Free text with many distinct values; not used as features.",
      className: "bg-slate-400/10 text-slate-300 ring-slate-400/30",
    },
    id_like: {
      label: "ID-like",
      description: "Looks like an identifier; excluded to avoid meaningless splits.",
      className: "bg-rose-400/10 text-rose-300 ring-rose-400/30",
    },
    constant: {
      label: "Constant",
      description: "One distinct value only; carries no information.",
      className: "bg-zinc-400/10 text-zinc-300 ring-zinc-400/30",
    },
  };

export const USABLE_FEATURE_KINDS: ReadonlySet<ColumnKind> = new Set([
  "numeric",
  "categorical",
  "boolean",
]);

/** Client-side pre-check only; the backend remains authoritative for every other rule. */
export function validateCsvFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".csv") || file.name.length <= 4) {
    return "Only .csv files can be uploaded.";
  }
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `The file is ${formatBytes(file.size)}; the upload limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  }
  return null;
}

/** Stable, distinguishable colors for class labels (index into the model's class list). */
const CLASS_COLORS = [
  "#2dd4bf",
  "#60a5fa",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#4ade80",
  "#f87171",
  "#22d3ee",
  "#e879f9",
];

export function classColor(index: number): string {
  return CLASS_COLORS[((index % CLASS_COLORS.length) + CLASS_COLORS.length) % CLASS_COLORS.length]!;
}
