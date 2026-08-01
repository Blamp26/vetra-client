export function ConversationDateSeparator({ date }: { date: string }) {
  return (
    <div className="my-3 flex items-center gap-3" data-testid="message-date-separator">
      <div className="h-px flex-1 bg-border" />
      <span className="rounded-full border border-border bg-card px-3 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{date}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
