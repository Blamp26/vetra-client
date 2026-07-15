import React from "react";
import { cn } from "@/shared/utils/cn";

export interface EmptyPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: React.ReactNode;
  density?: "workspace" | "compact";
  align?: "start" | "center";
  titleLevel?: 2 | 3;
}

export const EmptyPane = React.forwardRef<HTMLDivElement, EmptyPaneProps>(
  function EmptyPane(
    {
      title,
      description,
      action,
      density = "workspace",
      align = "center",
      titleLevel = 2,
      className,
      children,
      ...props
    },
    ref,
  ) {
    const Heading = titleLevel === 3 ? "h3" : "h2";

    return (
      <div
        {...props}
        ref={ref}
        data-density={density}
        data-align={align}
        className={cn(
          "vt-empty-pane",
          `vt-empty-pane--${density}`,
          `vt-empty-pane--${align}`,
          className,
        )}
      >
        <Heading className="vt-empty-pane__title">{title}</Heading>
        {description && <p className="vt-empty-pane__description">{description}</p>}
        {action && <div className="vt-empty-pane__action">{action}</div>}
        {children}
      </div>
    );
  },
);
