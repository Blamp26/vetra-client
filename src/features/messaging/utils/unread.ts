export function formatUnreadCount(count: number): string {
  const exact = Math.max(0, Math.floor(count));
  return exact > 999 ? "999+" : String(exact);
}
