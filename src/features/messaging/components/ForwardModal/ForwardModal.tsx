import { useId, useMemo, useRef, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { X, Search } from "lucide-react";
import { Avatar } from "@/shared/components/Avatar/Avatar";
import { sortConversationItems } from "../../utils/conversationOrdering";
import { cn } from "@/shared/utils/cn";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";

type Target = {
  type: "direct" | "room";
  kind: "direct" | "room";
  id: number;
  ref?: string | number | null;
  name: string;
  avatar?: string | null;
  time: string | null | undefined;
  pinned?: boolean | null;
};

interface Props {
  onForward: (target: Target) => Promise<void> | void;
  onCancel: () => void;
}

export function ForwardModal({ onForward, onCancel }: Props) {
  const conversationPreviews = useAppStore((s: RootState) => s.conversationPreviews);
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);
  const [search, setSearch] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const targets = useMemo<Target[]>(() => {
    const directTargets = Object.values(conversationPreviews).map((preview) => ({
      type: "direct" as const,
      kind: "direct" as const,
      id: preview.partner_id,
      ref: preview.partner_public_id ?? preview.partner_id,
      name: preview.partner_display_name || preview.partner_username,
      avatar: null,
      time: preview.last_message?.inserted_at,
      pinned: (preview as typeof preview & { pinned?: boolean }).pinned,
    }));
    const roomTargets = Object.values(roomPreviews)
      .filter((preview) => preview.server_id == null)
      .map((preview) => ({
        type: "room" as const,
        kind: "room" as const,
        id: preview.id,
        ref: preview.public_id ?? preview.id,
        name: preview.name,
        avatar: null,
        time: preview.last_message_at ?? preview.inserted_at,
        pinned: (preview as typeof preview & { pinned?: boolean }).pinned,
      }));

    return sortConversationItems<Target>([...directTargets, ...roomTargets]);
  }, [conversationPreviews, roomPreviews]);

  const visibleTargets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query === ""
      ? targets
      : targets.filter((target) => target.name.toLocaleLowerCase().includes(query));
  }, [search, targets]);

  const handleTargetClick = async (target: Target) => {
    const key = `${target.type}-${target.id}`;
    if (pendingKey) return;

    setPendingKey(key);
    setError(null);
    try {
      await onForward(target);
    } catch (reason) {
      setPendingKey(null);
      setError(reason instanceof Error ? reason.message : "Forwarding failed");
    }
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      labelledBy={titleId}
      initialFocusRef={searchInputRef}
      closeOnBackdrop={!pendingKey}
      className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden"
    >
        <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-border px-4">
          <h3 id={titleId} className="text-lg font-normal">Forward</h3>
          <IconButton label="Close forward dialog" size="compact" onClick={onCancel} disabled={Boolean(pendingKey)}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="shrink-0 border-b border-border p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <TextInput
              ref={searchInputRef}
              className="h-9 w-full pl-10 pr-4"
              placeholder="Search..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={Boolean(pendingKey)}
              aria-label="Search forwarding destinations"
            />
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:auto]" data-testid="forward-destination-list">
          {visibleTargets.map((target) => {
            const key = `${target.type}-${target.id}`;
            const isPending = pendingKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => void handleTargetClick(target)}
                disabled={Boolean(pendingKey)}
                aria-busy={isPending}
                className={cn(
                  "group flex h-[62px] w-full items-center gap-[11px] px-[10px] text-left transition-colors",
                  isPending ? "bg-accent" : "hover:bg-accent",
                  pendingKey && !isPending && "cursor-not-allowed opacity-60",
                )}
                data-testid={`forward-destination-${key}`}
                data-pending={isPending ? "true" : "false"}
              >
                <Avatar name={target.name} src={target.avatar} size="small" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-normal">{target.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {target.type === "direct" ? "Direct message" : "Group"}
                  </div>
                </div>
              </button>
            );
          })}
          {visibleTargets.length === 0 && (
            <div role="status" aria-live="polite" className="py-8 text-center text-xs text-muted-foreground">No results</div>
          )}
        </div>
    </Dialog>
  );
}
