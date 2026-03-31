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
          setError("Ошибка поиска. Попробуйте еще раз.");
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
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" 
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-[500px] max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            Поиск сообщений
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
              className="w-full bg-secondary border-none rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/60"
              placeholder="Введите текст для поиска…"
              value={query}
              onChange={handleChange}
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-[300px] flex flex-col gap-1 pr-1 custom-scrollbar">
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
                <span className="text-sm font-medium">Ищем сообщения...</span>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-12 text-destructive text-sm font-medium">
                {error}
              </div>
            )}

            {!loading && query && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60 gap-3">
                <MessageSquare className="w-10 h-10 opacity-20" />
                <span className="text-sm">Ничего не найдено</span>
              </div>
            )}

            {!loading && !query && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40 gap-3">
                <Search className="w-10 h-10 opacity-20" />
                <span className="text-sm">Начните вводить текст...</span>
              </div>
            )}

            {!loading && results.map((msg) => (
              <button
                key={msg.id}
                type="button"
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 text-left transition-all active:scale-[0.98] group cursor-pointer"
                onClick={() => { onJumpTo(msg.id); onClose(); }}
              >
                <Avatar 
                  name={msg.sender_display_name || msg.sender_username} 
                  src={msg.sender?.avatar_url}
                  size="medium"
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                      {msg.sender_display_name || msg.sender_username}
                    </span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(msg.inserted_at).toLocaleString("ru-RU", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed break-words">
                    {msg.content || (msg.media_file_id ? "📎 Attachment" : "")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
