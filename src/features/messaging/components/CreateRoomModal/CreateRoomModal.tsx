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
      setError("Enter group name");
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
        try { await socketManager.joinRoomChannel(room.id); } catch { /* non-critical */ }
      }

      setActiveChat({ type: "room", roomId: room.id });
      onClose();
    } catch (err) {
      setError("Create failed");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-normal">Create Group</h3>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>

        <div className="p-4 overflow-y-auto">
          {error && <div className="bg-destructive/10 border border-destructive p-2 text-destructive text-xs mb-4">{error}</div>}

          <div className="flex flex-col gap-1 mb-4">
            <label className="text-[10px] uppercase text-muted-foreground" htmlFor="create-room-name">Group name</label>
            <input
              className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
              id="create-room-name"
              type="text"
              placeholder="Name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-muted-foreground">Add members</label>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedUsers.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 px-2 py-1 bg-muted text-xs border border-border">
                    {u.display_name || u.username}
                    <button onClick={() => removeUser(u.id)} className="text-muted-foreground hover:text-destructive">×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <input
                className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
                type="text"
                placeholder="Search users..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {isSearching && <div className="p-1 text-xs text-muted-foreground">Searching...</div>}
              {searchResults.length > 0 && (
                <ul className="absolute left-0 right-0 top-full bg-popover border border-border z-[100] max-h-[200px] overflow-y-auto">
                  {searchResults.map((user) => (
                    <li key={user.id}>
                      <button
                        className="flex items-center gap-2 w-full p-2 bg-transparent border-none text-left hover:bg-accent"
                        onClick={() => addUser(user)}
                      >
                        <Avatar name={user.display_name || user.username} size="small" />
                        <span className="text-sm">{user.display_name || user.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-2 justify-end">
          <button className="px-4 py-2 text-sm border border-border" onClick={onClose} disabled={isCreating}>Cancel</button>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground text-sm border border-primary disabled:opacity-50"
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
          >
            {isCreating ? "..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
