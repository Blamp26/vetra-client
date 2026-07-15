import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/utils/cn";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

let scrollLockCount = 0;
let previousBodyOverflow = "";

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    if (element.getAttribute("aria-hidden") === "true") return false;
    if (element.hidden) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showBackdrop?: boolean;
  className?: string;
  overlayClassName?: string;
  children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showBackdrop = true,
  className,
  overlayClassName,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const initialFocus = initialFocusRef?.current;
    const focusable = getFocusableElements(dialog);
    const target =
      initialFocus && !initialFocus.hasAttribute("disabled")
        ? initialFocus
        : focusable[0] ?? dialog;

    target.focus();

    const handleFocusIn = (event: FocusEvent) => {
      if (dialog.contains(event.target as Node)) return;
      const nextTarget =
        initialFocusRef?.current && !initialFocusRef.current.hasAttribute("disabled")
          ? initialFocusRef.current
          : getFocusableElements(dialog)[0] ?? dialog;
      nextTarget.focus();
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget?.isConnected && !restoreTarget.hasAttribute("disabled")) {
        restoreTarget.focus();
      }
    };
  }, [initialFocusRef, open]);

  useEffect(() => {
    if (!open) return;

    if (scrollLockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLockCount += 1;

    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        previousBodyOverflow = "";
      }
    };
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!closeOnEscape || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === dialog)) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-modal flex items-center justify-center p-4",
        overlayClassName,
      )}
      data-testid="dialog-overlay"
    >
      {showBackdrop && (
        <div
          className="vt-dialog-backdrop"
          aria-hidden="true"
          onMouseDown={closeOnBackdrop ? onClose : undefined}
          data-testid="dialog-backdrop"
        />
      )}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn("vt-dialog-panel", className)}
        onKeyDown={handleKeyDown}
        data-testid="dialog-panel"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
