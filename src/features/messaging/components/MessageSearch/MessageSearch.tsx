import { useState, useCallback, useRef, useEffect } from "react";
import { roomsApi } from "@/api/rooms";
import { messagesApi } from "@/api/messages";
import { useAppStore } from "@/store";
import type { Message } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { Search, X, Loader2, MessageSquare } from "lucide-react";

interface Props {
  targetId: number;
  type:     "direct" | "room";
  onClose:  () => void;
  onJumpTo: (messageId: number) => void;
}

export function MessageSearch({ targetId, type, onClose, onJumpTo }: Props) {
  const currentUser = useAppStore((s) => s.currentUser);

  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      setError(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

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
              ? await roomsApi.search(targetId, val.trim())
              : await messagesApi.search(targetId, val.trim());
          setResults(msgs);
        } catch {
          setError("Search error.");
        } finally {
          setLoading(false);
        }
      }, 400);
    },
    [targetId, type, currentUser]
  );

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/50 p-4" 
      onClick={onClose}
    >
      <div 
        className="bg-card border border-border w-full max-w-[500px] max-h-[80vh] flex flex-col overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h3 className="text-sm font-normal flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            Search
          </h3>
          <button 
            className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground" 
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-hidden min-h-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              className="w-full bg-background border border-border px-10 py-2 text-sm outline-none focus:border-primary"
              placeholder="Search..."
              value={query}
              onChange={handleChange}
            />
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
            {loading && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">Searching...</span>
              </div>
            )}

            {!loading && error && (
              <div className="text-center py-10 text-destructive text-xs">
                {error}
              </div>
            )}

            {!loading && query.trim() && results.length === 0 && !error && (
              <div className="text-center py-10 text-muted-foreground text-xs">
                Nothing found
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase text-muted-foreground px-2 mb-1">
                  Results ({results.length})
                </div>
                {results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onJumpTo(m.id)}
                    className="w-full text-left p-2 border border-border bg-card hover:bg-accent flex flex-col gap-1"
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
                      {m.content || (m.media_file_id ? "Attachment" : "")}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {!loading && !query.trim() && (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground text-center">
                <MessageSquare className="w-8 h-8 opacity-20" />
                <span className="text-xs">Enter text to find messages</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
