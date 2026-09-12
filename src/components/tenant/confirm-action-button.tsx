"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A destructive action that asks first.
 *
 * `DeleteRecordButton` covers the ones that hit an API; this covers the
 * rest — removing a line from a cart being built, an attached document, an
 * uploaded photo. Those are local to a form and nothing has been saved
 * yet, but they are still one mis-tap away from losing work someone just
 * did (a scanned item, a document photographed at the counter), which is
 * exactly what a confirmation is for.
 */
export function ConfirmActionButton({
  onConfirm,
  title,
  description,
  confirmLabel = "Remove",
  ariaLabel,
  icon,
  disabled,
  size = "icon-sm",
  variant = "ghost",
  className,
  children,
}: {
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  ariaLabel: string;
  icon: ReactNode;
  disabled?: boolean;
  size?: "icon-sm" | "icon" | "sm";
  variant?: "ghost" | "outline";
  className?: string;
  /** Optional label rendered beside the icon (an icon-only button leaves
   * `ariaLabel` as the only name, which is fine for a dense row). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={ariaLabel}
        title={ariaLabel}
        disabled={disabled}
        className={className}
        onClick={() => setOpen(true)}
      >
        {icon}
        {children}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
