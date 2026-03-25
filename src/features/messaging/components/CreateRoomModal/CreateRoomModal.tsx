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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white border border-[#E1E1E1] rounded-lg shadow-xl w-full max-w-[440px] flex flex-col max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#E1E1E1] flex items-center justify-between">
          <h3 className="m-0 text-[1.1rem] font-bold">Create Group</h3>
          <button className="bg-none border-none text-[1.5rem] cursor-pointer text-[#7A7A7A] hover:text-[#0A0A0A]" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && <div className="bg-[#E74C3C]/12 border border-[#E74C3C] rounded-lg p-2.5 px-3 text-[#E74C3C] text-[0.85rem] mb-4">{error}</div>}

          <label className="block mb-1.5 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-[#4A4A4A]">Group name</label>
          <input
            className="w-full px-3 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#0A0A0A] text-[0.88rem] font-inherit outline-none focus:border-[#5865F2]"
            type="text"
            placeholder="Enter group name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <label className="block mb-1.5 mt-3 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-[#4A4A4A]">
            Add members
          </label>

          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedUsers.map((u) => (
                <span key={u.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EDEDED] text-[#0A0A0A] text-[0.85rem]">
                  {u.display_name || u.username}
                  <button
                    className="bg-none border-none cursor-pointer text-[1.1rem] text-[#7A7A7A] leading-none hover:text-[#E74C3C]"
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
              className="w-full px-3 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#0A0A0A] text-[0.88rem] font-inherit outline-none focus:border-[#5865F2]"
              type="text"
              placeholder="🔍 Search users…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {isSearching && (
              <div className="px-1 py-1.5 text-[0.78rem] text-[#7A7A7A]">
                Searching…
              </div>
            )}
            {searchResults.length > 0 && (
              <ul className="list-none absolute left-0 right-0 top-[calc(100%+4px)] bg-white border border-[#E1E1E1] rounded-lg shadow-lg z-[100] max-h-[200px] overflow-y-auto">
                {searchResults.map((user) => (
                  <li key={user.id}>
                    <button
                      className="flex items-center gap-2.5 w-full px-3 py-2 bg-none border-none cursor-pointer text-left transition-colors duration-100 hover:bg-[#EDEDED]"
                      onClick={() => addUser(user)}
                    >
                      <Avatar name={user.display_name || user.username} size="small" />
                      <span className="text-[0.9rem] text-[#0A0A0A]">{user.display_name || user.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#E1E1E1] flex gap-3 justify-end bg-[#F8F8F8]">
          <button className="px-4 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#4A4A4A] text-[0.88rem] font-inherit cursor-pointer hover:bg-[#EDEDED]" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-[#5865F2] text-white border-none rounded-lg text-[0.88rem] font-bold font-inherit cursor-pointer hover:bg-[#4752C4] disabled:opacity-50"
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
