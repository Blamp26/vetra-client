/**
 * Returns time (HH:MM) if the date is today, otherwise date (MMM DD).
 * Internal helper; used by formatPreviewTime and formatLastSeen.
 */
function timeOrDate(iso: string): { formatted: string; isToday: boolean } {
  const date = new Date(iso);
  const isToday = date.toDateString() === new Date().toDateString();
  const formatted = isToday
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
  return { formatted, isToday };
}

/**
 * Used in Sidebar for the last message preview.
 * null/undefined → empty string.
 */
export function formatPreviewTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return timeOrDate(iso).formatted;
}

/**
 * Uses in ChatWindow to show user status.
 * null/undefined → "offline".
 */
export function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return "offline";
  const { formatted, isToday } = timeOrDate(iso);
  return isToday ? `last seen at ${formatted}` : `last seen on ${formatted}`;
}

/**
 * Formats seconds into MM:SS (for calls).
 */
export function formatCallTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
