import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  testId?: string;
}

export function ConversationComposerShell({ children, testId = "message-composer-shell" }: Props) {
  return (
    <div className="relative flex flex-col border-t border-border bg-[color:var(--vetra-shell-chat-bg,var(--color-card))]" data-testid={testId}>
      {children}
    </div>
  );
}

export function ConversationComposerBar({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[46px] items-center gap-1 px-2 py-0.5 sm:px-3" data-testid="message-composer-bar">{children}</div>;
}
