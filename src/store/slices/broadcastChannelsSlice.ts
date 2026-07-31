import type { StateCreator } from "zustand";
import type { BroadcastChannel, BroadcastPublication, BroadcastSubscription } from "@/features/broadcastChannels/types";

export interface BroadcastChannelsSlice {
  broadcastChannels: Record<string, BroadcastChannel>;
  broadcastSubscriptions: Record<string, BroadcastSubscription>;
  broadcastPublications: Record<string, BroadcastPublication[]>;
  broadcastCursors: Record<string, string | null>;
  broadcastUnread: Record<string, boolean>;
  setBroadcastChannel: (channel: BroadcastChannel) => void;
  setBroadcastSubscriptions: (channels: BroadcastChannel[]) => void;
  setBroadcastSubscription: (id: string, state: BroadcastSubscription) => void;
  setBroadcastFeed: (id: string, publications: BroadcastPublication[], cursor: string | null, append?: boolean) => void;
  setBroadcastUnread: (id: string, unread: boolean) => void;
  clearBroadcastChannel: (id: string) => void;
}

export const createBroadcastChannelsSlice: StateCreator<any, [], [], BroadcastChannelsSlice> = (set) => ({
  broadcastChannels: {}, broadcastSubscriptions: {}, broadcastPublications: {}, broadcastCursors: {}, broadcastUnread: {},
  setBroadcastChannel: (channel) => set((state: any) => ({ broadcastChannels: { ...state.broadcastChannels, [channel.public_id]: channel } })),
  setBroadcastSubscriptions: (channels) => set((state: any) => ({
    broadcastChannels: { ...state.broadcastChannels, ...Object.fromEntries(channels.map((c) => [c.public_id, c])) },
    broadcastSubscriptions: Object.fromEntries(channels.map((c) => [c.public_id, { status: "active", muted: false }]))
  })),
  setBroadcastSubscription: (id, value) => set((state: any) => ({ broadcastSubscriptions: { ...state.broadcastSubscriptions, [id]: value } })),
  setBroadcastUnread: (id, unread) => set((state: any) => ({ broadcastUnread: { ...state.broadcastUnread, [id]: unread } })),
  setBroadcastFeed: (id, publications, cursor, append = false) => set((state: any) => ({
    broadcastPublications: { ...state.broadcastPublications, [id]: append ? (() => { const existing = state.broadcastPublications[id] ?? []; const seen = new Set(existing.map((p: BroadcastPublication) => p.public_id)); return [...existing, ...publications.filter((p: BroadcastPublication) => !seen.has(p.public_id))]; })() : publications },
    broadcastCursors: { ...state.broadcastCursors, [id]: cursor }
  })),
  clearBroadcastChannel: (id) => set((state: any) => ({ broadcastChannels: Object.fromEntries(Object.entries(state.broadcastChannels).filter(([key]) => key !== id)), broadcastSubscriptions: Object.fromEntries(Object.entries(state.broadcastSubscriptions).filter(([key]) => key !== id)), broadcastPublications: Object.fromEntries(Object.entries(state.broadcastPublications).filter(([key]) => key !== id)), broadcastUnread: Object.fromEntries(Object.entries(state.broadcastUnread).filter(([key]) => key !== id)) }))
});
