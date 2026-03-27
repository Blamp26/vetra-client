// ─────────────────────────────────────────────────────────────────────────────
// Core domain types (API models)
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id:           number;
  username:     string;        // уникальный логин
  display_name: string | null; // никнейм (не уникальный)
  bio:          string | null;
  avatar_url:   string | null;
  status:       'online' | 'away' | 'dnd' | 'offline';
  last_seen_at: string | null;
}

export type MessageStatus = "sent" | "delivered" | "read" | "error";

// Сгруппированная реакция для одного emoji на одном сообщении
export interface MessageReactionGroup {
  emoji:    string;
  count:    number;
  user_ids: number[];
}

export interface Message {
  id:                      number;
  content:                 string | null;
  sender_id:               number;
  recipient_id:            number | null;
  room_id:                 number | null;
  reply_to_id?:            number | null;
  status:                  MessageStatus;
  inserted_at:             string;
  edited_at?:              string | null;
  sender_username?:        string;
  sender_display_name?:    string | null;
  recipient_username?:     string;
  recipient_display_name?: string | null;
  media_file_id?:          string | null;
  media_mime_type?:        string | null;
  sender?:                 User;
  reactions?:              MessageReactionGroup[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket event payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface MessageEditedPayload {
  id:            number;
  content:       string;
  edited_at:     string;
  recipient_id?: number | null;
  sender_id?:    number;
  room_id?:      number | null;
}

export interface MessageDeletedPayload {
  id:            number;
  recipient_id?: number | null;
  sender_id?:    number;
  room_id?:      number | null;
}

export interface ReactionUpdatedPayload {
  message_id: number;
  reactions:  MessageReactionGroup[];
  partner_id?: number;
  sender_id?:  number;
  room_id?:    number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation / Room previews (sidebar items)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversationPreview {
  partner_id:           number;
  partner_username:     string;
  partner_display_name: string | null;
  unread_count:         number;
  last_message: {
    content:     string | null;
    inserted_at: string;
    sender_id:   number;
    media_file_id?:   string | null;
    media_mime_type?: string | null;
  };
}

export interface Room {
  id: number;
  name: string;
  created_by: number;
  server_id: number | null;
  inserted_at: string;
}

export interface RoomPreview {
  id: number;
  name: string;
  created_by: number;
  server_id: number | null;
  inserted_at: string;
  unread_count: number;
  last_message_at: string | null;
  last_message: {
    content: string | null;
    inserted_at: string;
    sender_id: number;
    media_file_id?:   string | null;
    media_mime_type?: string | null;
  } | null;
  members?: Array<{
    id: number;
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
  name: string;
  created_by: number;
  inserted_at: string;
}

export interface ServerMember {
  user_id:      number;
  username:     string;
  display_name: string | null;
  avatar_url:   string | null;
  joined_at:    string;
  is_owner:     boolean;
}

/** A Channel is a Room that belongs to a Server (server_id is non-null). */
export type Channel = Room & { server_id: number };
