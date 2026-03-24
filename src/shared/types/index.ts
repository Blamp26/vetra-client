import type { Message } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Active chat discriminated union
// ─────────────────────────────────────────────────────────────────────────────

export type ActiveChat =
  | { type: "direct";   partnerId: number }
  | { type: "room";     roomId: number }
  | { type: "server";   serverId: number }
  | { type: "channel";  channelId: number; serverId: number }
  | { type: "settings" };

// ─────────────────────────────────────────────────────────────────────────────
// App Store related types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversationState {
  messages:  Message[];
  hasMore:   boolean;
  isLoading: boolean;
}

export const DEFAULT_CONV: ConversationState = {
  messages:  [],
  hasMore:   true,
  isLoading: false,
};

// Re-export everything from api
export * from './api';
