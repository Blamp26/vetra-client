/**
 * Возвращает время (HH:MM) если дата сегодня, иначе дату (MMM DD).
 * Внутренний хелпер; используется formatPreviewTime и formatLastSeen.
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
 * Используется в Sidebar для превью последнего сообщения.
 * null/undefined → пустая строка.
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
