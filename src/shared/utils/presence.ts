import type { User } from "@/shared/types";
import { formatLastSeen } from "@/utils/formatDate";

export type PresenceStatus = User["status"];

interface ResolvePresenceStatusParams {
  userId: number;
  onlineUserIds: Set<number>;
  userStatuses: Record<number, PresenceStatus>;
  fallbackStatus?: PresenceStatus | null;
  lastSeenAt?: string | null;
  preferFallbackStatusWhenUnknown?: boolean;
}

const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

export function resolvePresenceStatus({
  userId,
  onlineUserIds,
  userStatuses,
  fallbackStatus,
  lastSeenAt,
  preferFallbackStatusWhenUnknown = false,
}: ResolvePresenceStatusParams): PresenceStatus {
  const isOnline = onlineUserIds.has(userId);
  const presenceStatus = userStatuses[userId];

  if (isOnline) {
    return presenceStatus ?? "online";
  }

  if (lastSeenAt) {
    return "offline";
  }

  if (preferFallbackStatusWhenUnknown && fallbackStatus) {
    return fallbackStatus;
  }

  return "offline";
}

export function getPresenceLabel(status: PresenceStatus): string {
  return PRESENCE_LABELS[status];
}

interface PresenceTextParams {
  status: PresenceStatus;
  lastSeenAt?: string | null;
}

export function getPresenceText({
  status,
  lastSeenAt,
}: PresenceTextParams): string {
  if (status === "offline") {
    return lastSeenAt
      ? formatLastSeen(lastSeenAt).replace(/^last seen/, "Last seen")
      : "Offline";
  }

  return getPresenceLabel(status);
}
