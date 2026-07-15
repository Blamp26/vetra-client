import React from "react";
import { cn } from "@/shared/utils/cn";

export type IconButtonSize = "compact" | "default" | "large";
export type IconButtonTone = "neutral" | "primary" | "danger";

export interface IconButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-label" | "aria-pressed" | "aria-busy"
  > {
  label: string;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  pressed?: boolean;
  loading?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      className,
      type = "button",
      label,
      size = "default",
      tone = "neutral",
      pressed,
      loading = false,
      disabled = false,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={pressed === undefined ? undefined : pressed}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        className={cn(
          "vt-icon-button",
          `vt-icon-button--${size}`,
          tone !== "neutral" && `vt-icon-button--${tone}`,
          pressed && "vt-icon-button--pressed",
          className,
        )}
      >
        {loading && <span className="vt-icon-button__spinner" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
