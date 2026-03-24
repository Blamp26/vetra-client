import { useState, useCallback, useRef } from "react";
import { roomsApi } from "@/api/rooms";
import { useAppStore } from "@/store";
import type { Message } from "@/types";

interface Props {
  roomId:   number;
  onClose:  () => void;
  onJumpTo: (messageId: number) => void;
}

export function MessageSearch({ roomId, onClose, onJumpTo }: Props) {
  const currentUser = useAppStore((s) => s.currentUser);

  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      setError(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!val.trim() || !currentUser) {
        setResults([]);
        return;
      }

      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const msgs = await roomsApi.search(roomId, val.trim());
          setResults(msgs);
        } catch {
          setError("Search failed. Try again.");
        } finally {
          setLoading(false);
        }
      }, 400);
    },
    [roomId, currentUser]
  );

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔍 Поиск сообщений</h3>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>

        <div className="modal-body" style={{ gap: 12 }}>
          <input
            autoFocus
            className="modal-input"
            placeholder="Введите текст для поиска…"
            value={query}
            onChange={handleChange}
          />

          {loading && <div className="search-status">Ищем…</div>}
          {error   && <div className="search-status" style={{ color: "var(--error)" }}>{error}</div>}

          {!loading && query && results.length === 0 && (
            <div className="search-status">Ничего не найдено</div>
          )}

          <div className="search-results-list">
            {results.map((msg) => (
              <button
                key={msg.id}
                type="button"
                className="search-result-row"
                onClick={() => { onJumpTo(msg.id); onClose(); }}
              >
                <span className="search-result-author">
                  {msg.sender_display_name || msg.sender_username}
                </span>
                <span className="search-result-content">{msg.content}</span>
                <span className="search-result-time">
                  {new Date(msg.inserted_at).toLocaleString("ru-RU", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
