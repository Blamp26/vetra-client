import type { Message } from './api';

export type ResourceRef = number | string;

// ─────────────────────────────────────────────────────────────────────────────
// Active chat discriminated union
// ─────────────────────────────────────────────────────────────────────────────

export type ActiveChat =
  | { type: "direct";   partnerId: number; partnerRef?: ResourceRef }
  | { type: "room";     roomId: number; roomRef?: ResourceRef }
  | { type: "server";   serverId: number; serverRef?: ResourceRef }
  | { type: "channel";  channelId: number; serverId: number; channelRef?: ResourceRef; serverRef?: ResourceRef }
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
