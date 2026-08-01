import { useState, type ComponentProps } from "react";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "@/shared/components/IconButton";
import type { Message } from "@/shared/types";
import { MessageItem } from "@/features/messaging/components/MessageList/MessageItem";
import type { BroadcastChannel, BroadcastPublication as Publication } from "../types";

type MessageItemProps = ComponentProps<typeof MessageItem>;

type Props = {
  channel: BroadcastChannel;
  publication: Publication;
  currentUserId?: string;
  canPin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  pinned: boolean;
  busy: boolean;
  onReaction: (reaction: string) => void;
  onShare: () => void;
  onForward: () => void;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpen: () => void;
  isConsecutive?: boolean;
  isGroupedWithNext?: boolean;
  alignmentMode?: "split" | "left-column";
};

function stableNumericId(value: string) {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result || 1;
}

function toMessage(channel: BroadcastChannel, publication: Publication): Message {
  const senderId = stableNumericId(publication.author.public_id ?? publication.channel_public_id);
  return {
    id: stableNumericId(publication.public_id),
    content: publication.deleted ? "Publication deleted" : publication.content,
    sender_id: senderId,
    sender_public_id: publication.author.public_id,
    recipient_id: null,
    room_id: null,
    status: "sent",
    inserted_at: publication.created_at,
    edited_at: publication.edited_at,
    sender_display_name: publication.author.display_name || channel.display_name,
    sender_username: channel.username ?? undefined,
    attachments: publication.media.map((media) => ({
      id: media.id,
      url: media.url,
      mime_type: media.mime_type,
      original_name: media.original_name ?? null,
      file_size: null,
      kind: media.mime_type.startsWith("image/") ? "photo" : media.mime_type.startsWith("video/") ? "video" : "file",
    })),
    reactions: (publication.reactions ?? []).map((reaction) => ({
      reaction: reaction.reaction,
      count: reaction.count,
      chosen: reaction.chosen,
    })),
  };
}

export function BroadcastPublication({ channel, publication, canPin, canEdit, canDelete, pinned, busy, onReaction, onShare, onForward, onPin, onEdit, onDelete, onOpen, isConsecutive = false, isGroupedWithNext = false, alignmentMode = "left-column" }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const message = toMessage(channel, publication);
  const noop = () => undefined;

  return (
    <div id={`broadcast-publication-${publication.public_id}`} className="group relative" data-testid="broadcast-publication">
      <MessageItem
        msg={message}
        isOwn={false}
        alignmentMode={alignmentMode}
        isConsecutive={isConsecutive}
        isGroupedWithNext={isGroupedWithNext}
        isSelected={false}
        selectionMode={false}
        isRoom
        messageReactions={message.reactions ?? []}
        currentUserId={0}
        onContextMenu={noop as MessageItemProps["onContextMenu"]}
        onToggleSelection={noop}
        onToggleReaction={(_, reaction) => onReaction(reaction)}
        onLightbox={noop as MessageItemProps["onLightbox"]}
        renderReplyPreview={() => null}
        formatTime={(iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      />
      {!publication.deleted && (
        <div className="absolute right-2 top-0 hidden rounded-full bg-background/90 shadow-sm ring-1 ring-border group-hover:flex group-focus-within:flex" data-testid="broadcast-publication-actions">
          <IconButton label="Publication actions" size="compact" onClick={() => setMenuOpen((open) => !open)}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          {menuOpen && <div role="menu" className="absolute right-0 top-9 z-10 min-w-36 rounded-md border border-border bg-popover p-1 shadow-lg">
            <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { onOpen(); setMenuOpen(false); }}>Open link</button>
            <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { onShare(); setMenuOpen(false); }}>Share link</button>
            {!channel.content_protection_enabled && <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { onForward(); setMenuOpen(false); }}>Forward</button>}
            {canPin && <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { onPin(); setMenuOpen(false); }}>{pinned ? "Unpin" : "Pin"}</button>}
            {canEdit && <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" disabled={busy} onClick={() => { onEdit(); setMenuOpen(false); }}>Edit</button>}
            {canDelete && <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent" disabled={busy} onClick={() => { onDelete(); setMenuOpen(false); }}>Delete</button>}
          </div>}
        </div>
      )}
    </div>
  );
}
