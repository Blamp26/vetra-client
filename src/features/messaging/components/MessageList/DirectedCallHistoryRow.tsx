import { PhoneCall } from "lucide-react";
import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";
import { getDirectedCallHistoryDuration, getDirectedCallHistoryLabel } from "./directedCallHistoryTimeline";

export function DirectedCallHistoryRow({
  entry,
  timestamp,
  formatTime,
}: {
  entry: DirectedCallHistoryEntry;
  timestamp: string;
  formatTime: (iso: string) => string;
}) {
  const label = getDirectedCallHistoryLabel(entry.status);
  const duration = getDirectedCallHistoryDuration(entry);
  const time = formatTime(timestamp);
  const accessibleText = [label, duration, time].filter(Boolean).join(", ");
  return (
    <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground" data-testid="directed-call-history-row" aria-label={accessibleText}>
      <PhoneCall className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
      {duration && <span aria-hidden="true">· {duration}</span>}
      <time dateTime={timestamp} aria-hidden="true">· {time}</time>
    </div>
  );
}
