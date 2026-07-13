// ─────────────────────────────────────────────────────────────────────────────
// Core domain types (API models)
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id:           number;
  public_id?:   string | null;
  username:     string;        // уникальный логин
  display_name: string | null; // никнейм (не уникальный)
  bio:          string | null;
  avatar_url:   string | null;
  status:       'online' | 'away' | 'dnd' | 'offline';
  last_seen_at: string | null;
  inserted_at?: string;
}

export type MessageStatus = "sent" | "delivered" | "read" | "error";
export interface MessageTextLinkEntity {
  type: "text_link";
  offset: number;
  length: number;
  url: string;
}

export type AttachmentKind = "photo" | "video" | "file" | "audio" | "voice";

export interface Attachment {
  id: string;
  url: string;
  display_url?: string | null;
  displayUrl?: string | null;
  original_url?: string | null;
  originalUrl?: string | null;
  mime_type: string;
  original_name: string | null;
  file_size: number | null;
  kind: AttachmentKind;
  duration_ms?: number | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
}

// Сгруппированная реакция для одного emoji на одном сообщении
export interface MessageReactionGroup {
  reaction: string;
  count:    number;
  chosen:   boolean;
  /** @deprecated accepted while older cached payloads drain */
  emoji?:   string;
  user_ids?: number[];
}

export interface ForwardedAttribution {
  source_public_id?: string | null;
  source_display_name?: string | null;
  source_username?: string | null;
  source_avatar_url?: string | null;
}

export interface Message {
  id:                      number;
  content:                 string | null;
  entities?:               MessageTextLinkEntity[];
  sender_id:               number;
  sender_public_id?:       string | null;
  recipient_id:            number | null;
  recipient_public_id?:    string | null;
  room_id:                 number | null;
  room_public_id?:         string | null;
  reply_to_id?:            number | null;
  forwarded_from?:        ForwardedAttribution | null;
  status:                  MessageStatus;
  inserted_at:             string;
  edited_at?:              string | null;
  sender_username?:        string;
  sender_display_name?:    string | null;
  recipient_username?:     string;
  recipient_display_name?: string | null;
  media_file_id?:          string | null;
  media_file_ids?:         string[] | null;
  media_mime_type?:        string | null;
  media_mime_types?:       string[] | null;
  attachment?:             Attachment | null;
  attachments?:            Attachment[] | null;
  sender?:                 User;
  reactions?:              MessageReactionGroup[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket event payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface MessageEditedPayload {
  id:            number;
  content:       string;
  entities?:     MessageTextLinkEntity[];
  edited_at:     string;
  recipient_id?: number | null;
  recipient_public_id?: string | null;
  sender_id?:    number;
  sender_public_id?: string | null;
  room_id?:      number | null;
  room_public_id?: string | null;
}

export interface MessageDeletedPayload {
  id:            number;
  recipient_id?: number | null;
  recipient_public_id?: string | null;
  sender_id?:    number;
  sender_public_id?: string | null;
  room_id?:      number | null;
  room_public_id?: string | null;
}

export interface ReactionUpdatedPayload {
  message_id: number;
  reactions:  MessageReactionGroup[];
  partner_id?: number;
  partner_public_id?: string | null;
  sender_id?:  number;
  sender_public_id?: string | null;
  room_id?:    number;
  room_public_id?: string | null;
  updated_at?: string;
}

export interface RoomMessageSummary {
  room_id: number;
  room_public_id?: string | null;
  message_id: number;
  sender_id: number;
  sender_public_id?: string | null;
  sender_display_name?: string | null;
  sender_username?: string | null;
  inserted_at: string;
  preview: string;
  message_type: "text" | "media" | "mixed";
  media_type?: string | null;
  attachment_kind?: AttachmentKind | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_mime_type?: string | null;
  unread_delta?: number;
  mention?: boolean;
}

export interface PreviewMessage {
  id: number;
  content: string | null;
  entities?: MessageTextLinkEntity[];
  preview?: string | null;
  inserted_at: string;
  sender_id: number;
  sender_public_id?: string | null;
  status: MessageStatus;
  media_file_id?: string | null;
  media_file_ids?: string[] | null;
  media_mime_type?: string | null;
  media_mime_types?: string[] | null;
  attachment?: Attachment | null;
  attachments?: Attachment[] | null;
  attachment_kind?: AttachmentKind | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_mime_type?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation / Room previews (sidebar items)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversationPreview {
  partner_id:           number;
  partner_public_id?:   string | null;
  partner_username:     string;
  partner_display_name: string | null;
  unread_count:         number;
  last_message: PreviewMessage;
}

export interface Room {
  id: number;
  public_id?: string | null;
  name: string;
  created_by: number;
  created_by_public_id?: string | null;
  server_id: number | null;
  server_public_id?: string | null;
  inserted_at: string;
}

export interface RoomPreview {
  id: number;
  public_id?: string | null;
  name: string;
  created_by: number;
  created_by_public_id?: string | null;
  server_id: number | null;
  server_public_id?: string | null;
  inserted_at: string;
  unread_count: number;
  last_message_at: string | null;
  last_message: PreviewMessage | null;
  members?: Array<{
    id: number;
    public_id?: string | null;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Servers & Channels (Discord-style)
// ─────────────────────────────────────────────────────────────────────────────

export interface Server {
  id: number;
  public_id?: string | null;
  name: string;
  created_by: number;
  created_by_public_id?: string | null;
  inserted_at: string;
}

export interface ServerMember {
  user_id:      number;
  user_public_id?: string | null;
  username:     string;
  display_name: string | null;
  avatar_url:   string | null;
  joined_at:    string;
  is_owner:     boolean;
}

/** A Channel is a Room that belongs to a Server (server_id is non-null). */
export type Channel = Room & { server_id: number };
