import { useState, type ReactNode } from "react";

import { userMessage } from "../api/client";
import { TrashIcon } from "./ui/icons";
import { Button } from "./ui/primitives";
import { ConfirmDialog } from "./ui/widgets";

/** A delete button that always asks for explicit confirmation first. */
export function DeleteButton({
  label,
  title,
  description,
  pending,
  error,
  onConfirm,
  size = "sm",
}: {
  label: string;
  title: string;
  description: ReactNode;
  pending: boolean;
  error: unknown;
  onConfirm: (close: () => void) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button variant="ghost" size={size} onClick={() => setOpen(true)} aria-label={label}>
        <TrashIcon /> <span>Delete</span>
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        confirmLabel="Delete permanently"
        busy={pending}
        error={error ? userMessage(error) : null}
        onCancel={close}
        onConfirm={() => onConfirm(close)}
      >
        {description}
      </ConfirmDialog>
    </>
  );
}
