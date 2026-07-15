import React from "react";
import { cn } from "@/shared/utils/cn";

export type TextInputSize = "default" | "compact";

export interface TextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "aria-invalid"> {
  invalid?: boolean;
  size?: TextInputSize;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput({ className, invalid = false, size = "default", ...props }, ref) {
    return (
      <input
        {...props}
        ref={ref}
        aria-invalid={invalid ? true : props["aria-invalid"]}
        className={cn("vt-input", size === "compact" && "vt-input--compact", invalid && "vt-input--invalid", className)}
      />
    );
  },
);
