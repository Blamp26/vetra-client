export type BroadcastVisibility = "public" | "private";
export type BroadcastCapability =
  | "publish"
  | "edit_others_publications"
  | "delete_others_publications"
  | "pin_publications"
  | "view_subscribers"
  | "ban_users";

export interface BroadcastChannelSummary {
  public_id: string;
  display_name: string;
  description?: string | null;
  avatar_url?: string | null;
  username?: string | null;
  visibility: BroadcastVisibility;
  status?: "active" | "frozen";
  subscriber_count?: number;
  realtime_topic?: string;
  content_protection_enabled?: boolean;
  allowed_reactions?: string[];
}

export interface BroadcastChannel extends BroadcastChannelSummary {
  status: "active" | "frozen";
  subscriber_count: number;
}

export interface SubscribedBroadcastChannelResponse {
  channel_public_id: string;
  display_name: string;
  description: string | null;
  avatar_url: string | null;
  visibility: BroadcastVisibility;
}

export interface BroadcastPublication {
  public_id: string;
  channel_public_id: string;
  display_identity: "channel" | "author_profile";
  content: string | null;
  content_type: "text" | "photo" | "video" | "file" | "album" | "deleted" | string;
  created_at: string;
  edited_at?: string | null;
  deleted: boolean;
  author: { public_id?: string | null; display_name: string };
  media: Array<{ id: string; url: string; mime_type: string; original_name?: string | null; kind: string }>;
  reactions?: Array<{ reaction: string; count: number; chosen: boolean }>;
}

export interface BroadcastSubscription {
  status: "active" | "ended";
  muted: boolean;
  unread?: boolean;
}

export interface BroadcastAdmin {
  user_public_id: string;
  tier: "full" | "limited";
  capabilities: BroadcastCapability[];
  appointed_at?: string;
}

export interface BroadcastGovernanceState {
  channel_public_id: string;
  role: "owner" | "administrator" | "subscriber";
  ownership_decline_available?: boolean;
  tier?: "owner" | "full" | "limited" | null;
  capabilities?: BroadcastCapability[];
}

export interface BroadcastOwnershipState {
  channel_public_id: string;
  decline_available: boolean;
}

export interface BroadcastInvite { channel_public_id: string; token: string; created_at: string; }
export interface BroadcastJoinRequest { user_public_id: string; status: string; inserted_at: string; decided_at?: string | null; }
export interface BroadcastSubscriber { public_id: string; username: string; display_name: string | null; avatar_url: string | null; }

export interface BroadcastAuditEvent {
  action_type: string;
  timestamp: string;
  actor: { public_id?: string; username?: string; display_name: string; avatar_url?: string | null };
  metadata: Record<string, string | number | boolean | string[]>;
}
