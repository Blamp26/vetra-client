import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Avatar } from "@/shared/components/Avatar";
import { IconButton } from "@/shared/components/IconButton";
import { MessageText } from "@/shared/components/MessageText/MessageText";
import { MessageReactions } from "@/features/messaging/components/MessageList/MessageReactions";
import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { AuthenticatedVideo } from "@/shared/components/AuthenticatedVideo";
import type { BroadcastChannel, BroadcastPublication } from "../types";

type Props = {
  channel: BroadcastChannel;
  publication: BroadcastPublication;
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
};

export function BroadcastPublication({ channel, publication, canPin, canEdit, canDelete, pinned, busy, onReaction, onShare, onForward, onPin, onEdit, onDelete, onOpen }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const author = publication.author.display_name || "Channel";
  const reactions = (publication.reactions ?? []).map((reaction) => ({ ...reaction, emoji: reaction.reaction }));

  return (
    <article id={`broadcast-publication-${publication.public_id}`} className="group relative flex gap-2 px-4 py-1.5" data-testid="broadcast-publication">
      <Avatar name={author} src={channel.avatar_url} size="small" className="mt-1 rounded-full" />
      <div className="min-w-0 max-w-[min(680px,calc(100%-2.5rem))]">
        <div className="mb-0.5 flex items-baseline gap-2 text-xs">
          <span className="font-semibold text-foreground">{author}</span>
          <time dateTime={publication.created_at} className="text-muted-foreground">{new Date(publication.created_at).toLocaleString()}</time>
          {publication.edited_at && <span className="text-muted-foreground">edited</span>}
        </div>
        <div className="message-text-scale rounded-[12px] bg-card px-2.5 py-2 shadow-sm ring-1 ring-border/50">
          {publication.deleted ? <p className="italic text-muted-foreground">Publication deleted</p> : <>
            <button type="button" className="mb-1 block text-xs text-muted-foreground hover:text-foreground" onClick={onOpen}>Open immutable publication link</button>
            {publication.content && <MessageText text={publication.content} className="whitespace-pre-wrap break-words select-text" />}
            {publication.media.length > 0 && <div className="mt-2 grid max-w-[480px] grid-cols-2 gap-0.5 overflow-hidden rounded-[12px]">
              {publication.media.map((media) => media.mime_type.startsWith("image/") ? <AuthenticatedImage key={media.id} src={media.url} alt={media.original_name ?? media.kind} className="max-h-[432px] min-h-20 w-full object-cover" draggable={false} onCopy={(event) => channel.content_protection_enabled && event.preventDefault()} /> : media.mime_type.startsWith("video/") ? <AuthenticatedVideo key={media.id} src={media.url} controls controlsList={channel.content_protection_enabled ? "nodownload" : undefined} className="col-span-2 max-h-[432px] w-full rounded object-contain" /> : <span key={media.id} className="col-span-2 flex items-center gap-2 rounded bg-muted px-3 py-2 text-sm">{media.original_name ?? media.kind}</span>)}
            </div>}
          </>}
        </div>
        {!publication.deleted && <MessageReactions messageId={0} reactions={reactions} onToggle={onReaction} />}
      </div>
      {!publication.deleted && <div className="absolute right-4 top-1 hidden group-hover:flex group-focus-within:flex rounded-full bg-background/90 shadow-sm ring-1 ring-border" data-testid="broadcast-publication-actions">
        <IconButton label="Publication actions" size="compact" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></IconButton>
        {menuOpen && <div role="menu" className="absolute right-0 top-9 z-10 min-w-36 rounded-md border border-border bg-popover p-1 shadow-lg">
          <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { onShare(); setMenuOpen(false); }}>Share link</button>
          {!channel.content_protection_enabled && <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { onForward(); setMenuOpen(false); }}>Forward</button>}
          {canPin && <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { onPin(); setMenuOpen(false); }}>{pinned ? "Unpin" : "Pin"}</button>}
          {canEdit && <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent" disabled={busy} onClick={() => { onEdit(); setMenuOpen(false); }}>Edit</button>}
          {canDelete && <button role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent" disabled={busy} onClick={() => { onDelete(); setMenuOpen(false); }}>Delete</button>}
        </div>}
      </div>}
    </article>
  );
}
