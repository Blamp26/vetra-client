import { forwardRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Avatar } from "@/shared/components/Avatar";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { cn } from "@/shared/utils/cn";

type GroupManagementWidth = "profile" | "settings";

interface GroupManagementFrameProps {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  width: GroupManagementWidth;
  inert?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
  overlayStyle?: CSSProperties;
}

const widthClasses: Record<GroupManagementWidth, string> = {
  profile: "max-w-[392px]",
  settings: "max-w-[366px]",
};

export function GroupManagementFrame({
  children,
  labelledBy,
  onClose,
  width,
  inert = false,
  initialFocusRef,
  overlayStyle,
}: GroupManagementFrameProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      inert={inert}
      labelledBy={labelledBy}
      initialFocusRef={initialFocusRef}
      overlayClassName="items-start overflow-hidden px-4 pb-4 pt-16"
      overlayStyle={overlayStyle}
      className={cn(
        "w-full max-h-[calc(100dvh-96px)] overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl",
        widthClasses[width],
      )}
    >
      <div
        className="flex max-h-[calc(100dvh-96px)] min-h-0 flex-col overflow-hidden"
        data-group-management-frame={width}
        data-testid="group-management-frame"
      >
        {children}
      </div>
    </Dialog>
  );
}

interface GroupManagementHeaderProps {
  title: string;
  titleId: string;
  closeLabel: string;
  onClose: () => void;
  backLabel?: string;
  onBack?: () => void;
}

export function GroupManagementHeader({
  title,
  titleId,
  closeLabel,
  onClose,
  backLabel,
  onBack,
}: GroupManagementHeaderProps) {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-3 border-b border-border px-5">
      {onBack && backLabel ? (
        <IconButton label={backLabel} size="compact" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      ) : (
        <span aria-hidden="true" />
      )}
      <h2 id={titleId} className="truncate text-center text-base font-semibold">
        {title}
      </h2>
      <IconButton label={closeLabel} size="compact" onClick={onClose}>
        <X className="h-4 w-4" aria-hidden="true" />
      </IconButton>
    </header>
  );
}

export const GroupManagementScrollBody = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function GroupManagementScrollBody({ children, className, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto", className)}
    >
      {children}
    </div>
  );
});

export function GroupManagementFooter({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <footer
      {...props}
      className={cn(
        "flex min-h-14 shrink-0 items-center justify-end gap-3 border-t border-border px-5 py-2",
        className,
      )}
    >
      {children}
    </footer>
  );
}

interface GroupManagementSectionProps
  extends React.HTMLAttributes<HTMLElement> {
  separated?: boolean;
}

export function GroupManagementSection({
  children,
  className,
  separated = false,
  ...props
}: GroupManagementSectionProps) {
  return (
    <>
      {separated && (
        <div
          className="h-2 shrink-0 border-y border-border bg-muted/30"
          aria-hidden="true"
          data-testid="group-management-section-separator"
        />
      )}
      <section {...props} className={cn("px-5", className)}>
        {children}
      </section>
    </>
  );
}

export function GroupManagementSubpage({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("space-y-3 px-5 pb-5 pt-4", className)}
      data-group-management-subpage="true"
    >
      {children}
    </div>
  );
}

interface GroupManagementPersonRowProps {
  name: string;
  secondary: ReactNode;
  avatarSrc?: string | null;
  trailing?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function GroupManagementPersonRow({
  name,
  secondary,
  avatarSrc,
  trailing,
  onClick,
  disabled = false,
}: GroupManagementPersonRowProps) {
  const content = (
    <>
      <div aria-hidden="true" className="shrink-0">
        <Avatar name={name} src={avatarSrc} size="large" className="h-10 w-10 rounded-full" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
      </span>
      {trailing && <span className="ml-2 flex shrink-0 items-center gap-1">{trailing}</span>}
    </>
  );
  const classes = "flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left";

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={typeof secondary === "string" ? `${name} ${secondary}` : name}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          classes,
          "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        )}
        data-group-management-person-row="selectable"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={classes} data-group-management-person-row="static">
      {content}
    </div>
  );
}

interface GroupManagementControlRowProps {
  label: string;
  control: ReactNode;
  htmlFor?: string;
  disabled?: boolean;
}

export function GroupManagementControlRow({
  label,
  control,
  htmlFor,
  disabled = false,
}: GroupManagementControlRowProps) {
  const content = (
    <>
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <span className="ml-3 flex w-28 shrink-0 items-center justify-end">{control}</span>
    </>
  );
  const classes = cn(
    "flex min-h-11 w-full items-center px-3 py-1.5",
    disabled && "cursor-not-allowed opacity-50",
  );

  return htmlFor ? (
    <label
      htmlFor={htmlFor}
      className={cn(classes, !disabled && "cursor-pointer hover:bg-accent")}
      data-group-management-control-row="label"
    >
      {content}
    </label>
  ) : (
    <div className={classes} data-group-management-control-row="static">
      {content}
    </div>
  );
}

interface GroupManagementRowProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  leading?: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  tone?: "normal" | "destructive";
}

export function GroupManagementRow({
  label,
  leading,
  secondary,
  trailing,
  tone = "normal",
  className,
  ...props
}: GroupManagementRowProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-11 w-full items-center px-5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        tone === "destructive"
          ? "text-destructive hover:text-destructive/80"
          : "text-foreground",
        className,
      )}
    >
      {leading && (
        <span className="mr-3 flex w-6 shrink-0 items-center justify-center" aria-hidden="true">
          {leading}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        {secondary && (
          <span className="block truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        )}
      </span>
      {trailing && (
        <span className="ml-3 flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {trailing}
        </span>
      )}
    </button>
  );
}
