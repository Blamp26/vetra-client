import { useState, useEffect, useRef } from "react";
import { useAppStore, type RootState } from "@/store";
import { authApi } from "@/api/auth";
import { roomsApi } from "@/api/rooms";
import type { User } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";

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
        const results = await authApi.searchUsers(query);
        const selectedIds = new Set(selectedUsers.map((u: User) => u.id));
        setSearchResults(results.users.filter((u: User) => !selectedIds.has(u.id)));
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
      const room = await roomsApi.create(name.trim(), memberIds);

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

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl shadow-2xl shadow-black/5 ring-1 ring-white/5 w-full max-w-[440px] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-300" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="m-0 text-lg font-bold text-foreground">Create Group</h3>
          <button className="bg-transparent border-none text-2xl cursor-pointer text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && <div className="bg-destructive/10 border border-destructive rounded-lg p-2.5 px-3 text-destructive text-sm mb-4">{error}</div>}

          <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-room-name">Group name</label>
          <input
            className="w-full px-3 py-2.5 bg-background border border-border/50 rounded-xl text-foreground text-[15px] outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm transition-shadow"
            id="create-room-name"
            name="room-name"
            type="text"
            placeholder="Enter group name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <label className="block mb-1.5 mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-room-search">
            Add members
          </label>

          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedUsers.map((u) => (
                <span key={u.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/80 text-foreground text-sm border border-border/50 shadow-sm">
                  {u.display_name || u.username}
                  <button
                    className="bg-transparent border-none cursor-pointer text-xl text-muted-foreground leading-none hover:text-destructive"
                    onClick={() => removeUser(u.id)}
                    aria-label={`Remove ${u.display_name || u.username}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <input
              className="w-full px-3 py-2.5 bg-background border border-border/50 rounded-xl text-foreground text-[15px] outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm transition-shadow"
              id="create-room-search"
              name="user-search"
              type="text"
              placeholder="🔍 Search users…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {isSearching && (
              <div className="px-1 py-1.5 text-xs text-muted-foreground">
                Searching…
              </div>
            )}
            {searchResults.length > 0 && (
              <ul className="list-none absolute left-0 right-0 top-[calc(100%+4px)] bg-popover border border-border rounded-lg shadow-lg z-[100] max-h-[200px] overflow-y-auto">
                {searchResults.map((user) => (
                  <li key={user.id}>
                    <button
                      className="flex items-center gap-2.5 w-full px-3 py-2 bg-transparent border-none cursor-pointer text-left transition-colors duration-100 hover:bg-accent"
                      onClick={() => addUser(user)}
                    >
                      <Avatar name={user.display_name || user.username} size="small" />
                      <span className="text-sm text-foreground">{user.display_name || user.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end bg-muted/30">
          <button className="px-4 py-2 bg-background border border-border/50 rounded-xl text-muted-foreground text-sm font-medium transition-all cursor-pointer hover:bg-muted active:scale-95 shadow-sm" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground border-none rounded-xl text-sm font-medium transition-all active:scale-95 cursor-pointer hover:bg-primary/90 disabled:opacity-50 shadow-sm shadow-primary/20"
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
