import { PhoneCall } from "lucide-react";
import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";
import { getDirectedCallHistoryDuration, getDirectedCallHistoryLabel } from "./directedCallHistoryTimeline";

export function DirectedCallHistoryRow({ entry }: { entry: DirectedCallHistoryEntry }) {
  const label = getDirectedCallHistoryLabel(entry.status);
  const duration = getDirectedCallHistoryDuration(entry);
  const accessibleText = duration ? `${label}, ${duration}` : label;
  return (
    <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground" data-testid="directed-call-history-row" aria-label={accessibleText}>
      <PhoneCall className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
      {duration && <span aria-label={`Duration ${duration}`}>· {duration}</span>}
    </div>
  );
}
