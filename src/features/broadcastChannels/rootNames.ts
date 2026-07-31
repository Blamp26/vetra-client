/** Root paths occupied by the deployed web application. Server validation is authoritative. */
export const RESERVED_BROADCAST_ROOT_NAMES = ["api", "assets", "invite"] as const;

export function normalizeBroadcastUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isReservedBroadcastRootName(value: string): boolean {
  return (RESERVED_BROADCAST_ROOT_NAMES as readonly string[]).includes(normalizeBroadcastUsername(value));
}
