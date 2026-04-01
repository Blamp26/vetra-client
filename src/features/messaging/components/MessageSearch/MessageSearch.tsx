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
          setError("Search error. Please try again.");
        } finally {
          setLoading(false);
        }
      }, 400);
    },
    [targetId, type, currentUser]
  );

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-300" 
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-card border border-border/50 rounded-2xl shadow-2xl shadow-black/5 ring-1 ring-white/5 w-full max-w-[500px] max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-300" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            Search messages
          </h3>
          <button 
            className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground cursor-pointer" 
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-hidden min-h-0">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              ref={inputRef}
              id="message-text-search"
              name="search-query"
              className="w-full bg-background border border-border/50 rounded-xl pl-10 pr-4 py-2.5 text-[15px] focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-sm outline-none transition-all placeholder:text-muted-foreground/60"
              placeholder="Enter text to search..."
              value={query}
              onChange={handleChange}
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 min-h-0 py-2">
            {loading && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground animate-in fade-in zoom-in-95">
                <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
                <span className="text-sm font-medium">Searching...</span>
              </div>
            )}

            {!loading && error && (
              <div className="text-center py-10 text-destructive bg-destructive/5 rounded-xl border border-destructive/20 mx-2 animate-in fade-in">
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            {!loading && query.trim() && results.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground animate-in fade-in zoom-in-95">
                <div className="p-4 rounded-full bg-muted/50 border border-border/50">
                  <X className="w-8 h-8 opacity-40" />
                </div>
                <span className="text-sm font-medium">Nothing found</span>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-3 px-1">
                <div className="text-[0.7rem] uppercase tracking-widest font-bold text-muted-foreground/60 px-2 flex justify-between items-center mb-1">
                  <span>Results</span>
                  <span className="bg-muted px-2 py-0.5 rounded-full lowercase">{results.length} matches</span>
                </div>
                {results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onJumpTo(m.id)}
                    className="w-full text-left p-3.5 rounded-xl border border-border/40 bg-card hover:bg-accent hover:border-primary/30 hover:shadow-md transition-all duration-300 group relative flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.sender_display_name || m.sender_username} size="small" src={m.sender?.avatar_url} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                            {m.sender_display_name || m.sender_username}
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            {new Date(m.inserted_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pl-8">
                      <p className="text-[13px] text-muted-foreground group-hover:text-foreground line-clamp-3 transition-colors leading-relaxed">
                        {m.content || (m.media_file_id ? "📎 Attachment" : "")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!loading && !query.trim() && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground animate-in fade-in zoom-in-95">
                <div className="p-5 rounded-3xl bg-primary/5 border border-primary/10 shadow-inner">
                  <MessageSquare className="w-10 h-10 text-primary/30" />
                </div>
                <div className="text-center space-y-1">
                  <span className="text-sm font-bold text-foreground/80 block">Message Search</span>
                  <p className="text-xs text-muted-foreground/60 max-w-[240px]">
                    Find anything you said or heard in this chat.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
