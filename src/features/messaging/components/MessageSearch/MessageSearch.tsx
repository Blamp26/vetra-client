import { useState, useCallback, useRef, useEffect, useId } from "react";
import { roomsApi } from "@/api/rooms";
import { messagesApi } from "@/api/messages";
import { useAppStore } from "@/store";
import type { Message } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { Search, X, Loader2 } from "lucide-react";
import { withFallbackRef } from "@/shared/utils/refs";
import { getPreviewText } from "../../utils/attachments";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";

interface Props {
  targetId: number;
  type:     "direct" | "room";
  onClose:  () => void;
  onJumpTo: (messageId: number) => void;
}

export function MessageSearch({ targetId, type, onClose, onJumpTo }: Props) {
  const currentUser = useAppStore((s) => s.currentUser);
  const conversationPreviews = useAppStore((s) => s.conversationPreviews);
  const roomPreviews = useAppStore((s) => s.roomPreviews);
  const titleId = useId();

  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    return () => {
      requestVersionRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      setError(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      const requestVersion = ++requestVersionRef.current;

      if (!val.trim() || !currentUser) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const msgs = 
            type === "room" 
              ? await roomsApi.search(
                  withFallbackRef(targetId, undefined, roomPreviews[targetId]),
                  val.trim(),
                )
              : await messagesApi.search(
                  withFallbackRef(
                    targetId,
                    undefined,
                    conversationPreviews[targetId]
                      ? { id: targetId, public_id: conversationPreviews[targetId].partner_public_id }
                      : undefined,
                  ),
                  val.trim(),
                );
          if (requestVersion !== requestVersionRef.current) return;
          setResults(msgs);
        } catch {
          if (requestVersion !== requestVersionRef.current) return;
          setError("Search error.");
        } finally {
          if (requestVersion === requestVersionRef.current) setLoading(false);
        }
      }, 400);
    },
    [targetId, type, currentUser, conversationPreviews, roomPreviews]
  );

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={inputRef}
      className="bg-card border border-border w-full max-w-[500px] max-h-[80vh] flex flex-col overflow-hidden"
    >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h3 id={titleId} className="text-sm font-normal">Search messages</h3>
          <IconButton label="Close message search" size="compact" onClick={onClose}>
            <X className="w-4 h-4" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-hidden min-h-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <TextInput
              ref={inputRef}
              aria-label="Search messages"
              className="w-full pl-10"
              placeholder="Search..."
              value={query}
              onChange={handleChange}
            />
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
            {loading && (
              <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">Searching...</span>
              </div>
            )}

            {!loading && error && (
              <div role="alert" className="text-center py-10 text-destructive text-xs">
                {error}
              </div>
            )}

            {!loading && query.trim() && results.length === 0 && !error && (
              <div role="status" className="text-center py-10 text-muted-foreground text-xs">
                Nothing found
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-1">
                <div className="mb-1 px-2 text-xs text-muted-foreground">
                  {results.length} result{results.length === 1 ? "" : "s"}
                </div>
                {results.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => onJumpTo(m.id)}
                    className="flex w-full flex-col gap-1 rounded-[8px] p-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={m.sender_display_name || m.sender_username} size="small" src={m.sender?.avatar_url} />
                      <div className="flex-1 min-w-0 flex items-center justify-between">
                        <span className="text-xs font-normal truncate">
                          {m.sender_display_name || m.sender_username}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(m.inserted_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <p className="pl-8 text-xs text-muted-foreground line-clamp-2">
                      {getPreviewText(m, "")}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {!loading && !query.trim() && (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground text-center">
                <span className="text-xs">Enter text to find messages</span>
              </div>
            )}
          </div>
        </div>
    </Dialog>
  );
}
