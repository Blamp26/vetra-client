import { describe, expect, it, vi } from "vitest";
import { joinBroadcastTopic, subscribeBroadcastUserEvents } from "./broadcastRealtime";

describe("broadcast realtime isolation", () => {
  it("joins only the dedicated topic and ignores duplicate or foreign events", () => {
    const handlers: Record<string, (payload?: unknown) => void> = {};
    const leave = vi.fn();
    const channel = { on: (name: string, fn: (payload?: unknown) => void) => { handlers[name] = fn; return name; }, join: vi.fn(), leave };
    const manager = { socket: { channel: vi.fn(() => channel) } } as never;
    const onChanged = vi.fn();
    const cleanup = joinBroadcastTopic(manager, "broadcast_channel:channel-public:epoch", { onChanged });
    expect((manager as { socket: { channel: ReturnType<typeof vi.fn> } }).socket.channel).toHaveBeenCalledWith("broadcast_channel:channel-public:epoch", {});
    expect(channel.join).toHaveBeenCalled();
    handlers.broadcast_publication_edited?.({ channel_public_id: "channel-public", publication_public_id: "publication-public", event_id: "event-1" });
    handlers.broadcast_publication_edited?.({ channel_public_id: "channel-public", publication_public_id: "publication-public", event_id: "event-1" });
    handlers.broadcast_publication_edited?.({ channel_public_id: "other", publication_public_id: "other-publication" });
    expect(onChanged).toHaveBeenCalledTimes(1);
    handlers.broadcast_access_revoked?.();
    expect(leave).toHaveBeenCalled();
    cleanup();
  });

  it("passes distinct lifecycle events for one publication without an event id", () => {
    const handlers: Record<string, (payload?: unknown) => void> = {};
    const channel = { on: (name: string, fn: (payload?: unknown) => void) => { handlers[name] = fn; return name; }, join: vi.fn(), leave: vi.fn() };
    const manager = { socket: { channel: vi.fn(() => channel) } } as never;
    const onPublication = vi.fn();
    const onChanged = vi.fn();
    joinBroadcastTopic(manager, "broadcast_channel:channel-public:3", { onPublication, onChanged });
    const payload = { channel_public_id: "channel-public", publication_public_id: "publication-public" };
    handlers.broadcast_publication_created?.(payload);
    handlers.broadcast_publication_edited?.(payload);
    handlers.broadcast_publication_pinned?.(payload);
    handlers.broadcast_publication_unpinned?.(payload);
    handlers.broadcast_reaction_updated?.(payload);
    handlers.broadcast_publication_deleted?.(payload);
    expect(onPublication).toHaveBeenCalledOnce();
    expect(onChanged).toHaveBeenCalledTimes(5);
  });

  it("deduplicates only repeated genuine event ids", () => {
    const handlers: Record<string, (payload?: unknown) => void> = {};
    const channel = { on: (name: string, fn: (payload?: unknown) => void) => { handlers[name] = fn; return name; }, join: vi.fn(), leave: vi.fn() };
    const manager = { socket: { channel: vi.fn(() => channel) } } as never;
    const onChanged = vi.fn();
    joinBroadcastTopic(manager, "broadcast_channel:channel-public:3", { onChanged });
    const payload = { channel_public_id: "channel-public", publication_public_id: "publication-public" };
    handlers.broadcast_publication_edited?.({ ...payload, event_id: "event-1" });
    handlers.broadcast_publication_edited?.({ ...payload, event_id: "event-1" });
    handlers.broadcast_publication_edited?.({ ...payload, event_id: "event-2" });
    handlers.broadcast_publication_edited?.(payload);
    handlers.broadcast_publication_edited?.(payload);
    expect(onChanged).toHaveBeenCalledTimes(4);
  });

  it("ignores events after revocation or cleanup", () => {
    const handlers: Record<string, (payload?: unknown) => void> = {};
    const leave = vi.fn();
    const channel = { on: (name: string, fn: (payload?: unknown) => void) => { handlers[name] = fn; return name; }, join: vi.fn(), leave };
    const manager = { socket: { channel: vi.fn(() => channel) } } as never;
    const onChanged = vi.fn();
    const onRevoked = vi.fn();
    const cleanup = joinBroadcastTopic(manager as never, "broadcast_channel:channel-public:3", { onChanged, onRevoked });
    handlers.broadcast_access_revoked?.({ channel_public_id: "channel-public", previous_epoch: 3 });
    handlers.broadcast_publication_edited?.({ channel_public_id: "channel-public", publication_public_id: "publication-public" });
    expect(onRevoked).toHaveBeenCalledOnce();
    expect(onChanged).not.toHaveBeenCalled();
    cleanup();
    expect(leave).toHaveBeenCalledTimes(2);
  });

  it("refuses room topics", () => {
    const manager = { socket: { channel: vi.fn() } };
    const cleanup = joinBroadcastTopic(manager as never, "room:123", {});
    expect(manager.socket.channel).not.toHaveBeenCalled();
    cleanup();
  });

  it("subscribes the authenticated user topic once and removes both listeners", () => {
    const handlers: Record<string, (payload?: unknown) => void> = {};
    const off = vi.fn();
    const manager = { userChannel: { on: vi.fn((name: string, handler: (payload?: unknown) => void) => { handlers[name] = handler; return `${name}-ref`; }), off } } as never;
    const onUnread = vi.fn(); const onNotification = vi.fn();
    const cleanup = subscribeBroadcastUserEvents(manager, { onUnread, onNotification });
    handlers.broadcast_unread_updated?.({ channel_public_id: "channel-public" });
    handlers.broadcast_notification?.({ idempotency_key: "delivery-1", channel_public_id: "channel-public" });
    expect(onUnread).toHaveBeenCalledOnce(); expect(onNotification).toHaveBeenCalledOnce();
    cleanup();
    expect(off).toHaveBeenCalledTimes(2);
  });
});
