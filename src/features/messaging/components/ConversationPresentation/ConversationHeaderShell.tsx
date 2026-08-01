import type { HTMLAttributes, ReactNode, Ref } from "react";

interface Props {
  avatar: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  actions: ReactNode;
  testId?: string;
  identityLayers?: ReactNode;
  headerProps?: HTMLAttributes<HTMLDivElement>;
  identityProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  identityRef?: Ref<HTMLButtonElement>;
}

export function ConversationHeaderShell({ avatar, title, subtitle, actions, testId = "chat-header", identityLayers, headerProps, identityProps, identityRef }: Props) {
  return (
    <div {...headerProps} className="flex h-[54px] shrink-0 items-center justify-between border-b border-border px-4" data-testid={testId}>
      {identityLayers ?? (identityProps || identityRef ? (
        <button ref={identityRef} type="button" {...identityProps} className="flex min-w-0 flex-1 items-center gap-3 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          {avatar}
          <div className="flex min-w-0 flex-col justify-center self-stretch gap-0.5">
            <h3 className="truncate text-[15px] font-semibold leading-5">{title}</h3>
            <p className="truncate text-[12px] leading-[14px] text-muted-foreground">{subtitle}</p>
          </div>
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
          {avatar}
          <div className="flex min-w-0 flex-col justify-center self-stretch gap-0.5">
            <h3 className="truncate text-[15px] font-semibold leading-5">{title}</h3>
            <p className="truncate text-[12px] leading-[14px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      ))}
      <div className="flex h-full shrink-0 items-center" data-testid={`${testId}-actions`}>{actions}</div>
    </div>
  );
}
