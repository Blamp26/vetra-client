import React from "react";
import { cn } from "@/shared/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "compact" | "default";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      type = "button",
      variant = "secondary",
      size = "default",
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
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "vt-button",
          `vt-button--${variant}`,
          size === "compact" && "vt-button--compact",
          loading && "vt-button--loading",
          className,
        )}
      >
        {loading && <span className="vt-button__spinner" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
