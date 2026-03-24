import { useState, useEffect, useRef } from "react";
import { useAppStore, type RootState } from "@/store";
import { authApi } from "@/api/auth";
import { roomsApi } from "@/api/rooms";
import type { User } from "@/shared/types";

interface Props {
  onClose: () => void;
}

export function CreateRoomModal({ onClose }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const socketManager = useAppStore((s: RootState) => s.socketManager);
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);
  const upsertRoomPreview = useAppStore((s: RootState) => s.upsertRoomPreview);

  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || !currentUser) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await authApi.searchUsers(query, currentUser.id);
        const selectedIds = new Set(selectedUsers.map((u: User) => u.id));
        setSearchResults(results.filter((u: User) => !selectedIds.has(u.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, currentUser, selectedUsers]);

  const addUser = (user: User) => {
    setSelectedUsers((prev) => [...prev, user]);
    setQuery("");
    setSearchResults([]);
  };

  const removeUser = (userId: number) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleCreate = async () => {
    if (!currentUser || !name.trim()) {
      setError("Please enter a group name.");
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const memberIds = selectedUsers.map((u) => u.id);
      const room = await roomsApi.create(name.trim(), memberIds, currentUser.id);

      upsertRoomPreview({
        id: room.id,
        name: room.name,
        created_by: room.created_by,
        server_id: null,
        inserted_at: room.inserted_at,
        unread_count: 0,
        last_message_at: null,
        last_message: null,
      });

      if (socketManager) {
        try {
          await socketManager.joinRoomChannel(room.id);
        } catch {
          // некритично
        }
      }

      setActiveChat({ type: "room", roomId: room.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Group</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}

          <label className="modal-label">Group name</label>
          <input
            className="modal-input"
            type="text"
            placeholder="Enter group name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <label className="modal-label" style={{ marginTop: "12px" }}>
            Add members
          </label>

          {selectedUsers.length > 0 && (
            <div className="member-chips">
              {selectedUsers.map((u) => (
                <span key={u.id} className="member-chip">
                  {u.display_name || u.username}
                  <button
                    className="chip-remove"
                    onClick={() => removeUser(u.id)}
                    aria-label={`Remove ${u.display_name || u.username}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div style={{ position: "relative" }}>
            <input
              className="modal-input"
              type="text"
              placeholder="🔍 Search users…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {isSearching && (
              <div className="search-status" style={{ paddingLeft: 0 }}>
                Searching…
              </div>
            )}
            {searchResults.length > 0 && (
              <ul className="search-results modal-search-results">
                {searchResults.map((user) => (
                  <li key={user.id}>
                    <button
                      className="search-result-item"
                      onClick={() => addUser(user)}
                    >
                      <span className="avatar">{(user.display_name || user.username)[0].toUpperCase()}</span>
                      <span className="nickname">{user.display_name || user.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            className="btn-primary"
            style={{ marginTop: 0 }}
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
          >
            {isCreating ? "Creating…" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
