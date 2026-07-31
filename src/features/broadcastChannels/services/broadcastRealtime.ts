import type { Channel } from "phoenix";
import type { SocketManager } from "@/services/socket";

export type BroadcastRealtimeHandlers = {
  onPublication?: (payload: unknown) => void;
  onChanged?: (payload: unknown) => void;
  onRevoked?: () => void;
  onUnread?: (payload: unknown) => void;
  onNotification?: (payload: unknown) => void;
};

export function joinBroadcastTopic(manager: SocketManager | null, topic: string, handlers: BroadcastRealtimeHandlers): () => void {
  if (!manager || !topic.startsWith("broadcast_channel:")) return () => undefined;
  const channel: Channel = manager.socket.channel(topic, {});
  const seen = new Set<string>();
  let active = true;
  const channelId = topic.slice("broadcast_channel:".length).split(":")[0];
  const safe = (handler?: (payload: unknown) => void) => (payload: unknown) => { if (!active || !payload || typeof payload !== "object") return; const value = payload as Record<string, unknown>; if (value.channel_public_id && value.channel_public_id !== channelId) return; const eventId = typeof value.event_id === "string" ? value.event_id.trim() : ""; if (eventId) { if (seen.has(eventId)) return; seen.add(eventId); if (seen.size > 500) seen.delete(seen.values().next().value as string); } handler?.(payload); };
  channel.on("broadcast_publication_created", safe(handlers.onPublication));
  channel.on("broadcast_publication_edited", safe(handlers.onChanged));
  channel.on("broadcast_publication_deleted", safe(handlers.onChanged));
  channel.on("broadcast_publication_pinned", safe(handlers.onChanged));
  channel.on("broadcast_publication_unpinned", safe(handlers.onChanged));
  channel.on("broadcast_reaction_updated", safe(handlers.onChanged));
  channel.on("broadcast_access_revoked", () => { active = false; channel.leave(); handlers.onRevoked?.(); });
  channel.join();
  return () => { active = false; channel.leave(); };
}

export function subscribeBroadcastUserEvents(manager: SocketManager | null, handlers: Pick<BroadcastRealtimeHandlers, "onUnread" | "onNotification">): () => void {
  if (!manager) return () => undefined;
  const unread = (payload: unknown) => { if (payload && typeof payload === "object") handlers.onUnread?.(payload); };
  const notification = (payload: unknown) => { if (payload && typeof payload === "object") handlers.onNotification?.(payload); };
  const unreadRef = manager.userChannel.on("broadcast_unread_updated", unread);
  const notificationRef = manager.userChannel.on("broadcast_notification", notification);
  return () => { manager.userChannel.off("broadcast_unread_updated", unreadRef); manager.userChannel.off("broadcast_notification", notificationRef); };
}
