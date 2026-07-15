import { useState, useEffect, useId, useRef } from "react";
import { useAppStore, type RootState } from "@/store";
import { authApi } from "@/api/auth";
import { roomsApi } from "@/api/rooms";
import type { User } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { roomChatForPreview } from "@/shared/utils/chatRoutes";
import { userRef } from "@/shared/utils/refs";
import {
  Combobox,
  ComboboxInput,
  ComboboxList,
  ComboboxOption,
} from "@/shared/components/Combobox";
import { Button } from "@/shared/components/Button";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import { X } from "lucide-react";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchValue, setActiveSearchValue] = useState<string | undefined>();
  const memberInputId = useId();
  const titleId = useId();
  const nameErrorId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || !currentUser) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchOpen(false);
      setActiveSearchValue(undefined);
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
    setSearchOpen(false);
    setActiveSearchValue(undefined);
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
      const memberIds = selectedUsers.map((u) => userRef(u) ?? u.id);
      const room = await roomsApi.create(name.trim(), memberIds);

      upsertRoomPreview({
        id: room.id,
        public_id: room.public_id,
        name: room.name,
        created_by: room.created_by,
        created_by_public_id: room.created_by_public_id,
        server_id: null,
        server_public_id: null,
        inserted_at: room.inserted_at,
        unread_count: 0,
        last_message_at: null,
        last_message: null,
      });

      if (socketManager) {
        try { await socketManager.joinRoomChannel(room.id, room.public_id ?? room.id); } catch { /* non-critical */ }
      }

      setActiveChat(
        roomChatForPreview({
          id: room.id,
          public_id: room.public_id,
          name: room.name,
          created_by: room.created_by,
          created_by_public_id: room.created_by_public_id,
          server_id: null,
          server_public_id: null,
          inserted_at: room.inserted_at,
          unread_count: 0,
          last_message_at: null,
          last_message: null,
        }),
      );
      onClose();
    } catch (err) {
      setError("Create failed");
    } finally {
      setIsCreating(false);
    }
  };

  const nameInvalid = error === "Enter group name";

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={nameInputRef}
      className="w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden"
    >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 id={titleId} className="text-lg font-normal">Create Group</h3>
          <IconButton label="Close create group" size="compact" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="p-4 overflow-y-auto">
          {error && <div id={nameInvalid ? nameErrorId : undefined} role="alert" className="mb-4 text-sm text-destructive">{error}</div>}

          <div className="flex flex-col gap-1 mb-4">
            <label className="text-sm font-medium" htmlFor="create-room-name">Group name</label>
            <TextInput
              ref={nameInputRef}
              aria-describedby={nameInvalid ? nameErrorId : undefined}
              invalid={nameInvalid}
              className="w-full"
              id="create-room-name"
              type="text"
              placeholder="Name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <Combobox
            open={searchOpen}
            onOpenChange={setSearchOpen}
            activeValue={activeSearchValue}
            onActiveValueChange={setActiveSearchValue}
            className="flex flex-col gap-1"
          >
            <label className="text-sm font-medium" htmlFor={memberInputId}>Add members</label>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedUsers.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 px-2 py-1 bg-muted text-xs">
                    {u.display_name || u.username}
                    <IconButton
                      label={`Remove ${u.display_name || u.username}`}
                      size="compact"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeUser(u.id)}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </IconButton>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <ComboboxInput
                id={memberInputId}
                aria-label="Add members"
                className="w-full"
                type="text"
                placeholder="Search users..."
                value={query}
                onFocus={() => { if (query.trim()) setSearchOpen(true); }}
                onChange={(e) => { setQuery(e.target.value); setActiveSearchValue(undefined); setSearchOpen(Boolean(e.target.value.trim())); }}
              />
              {isSearching && <div className="p-1 text-xs text-muted-foreground" role="status" aria-live="polite">Searching...</div>}
              <ComboboxList aria-label="Member search results" className="absolute left-0 right-0 top-full z-[100] max-h-[200px] overflow-y-auto bg-popover">
                  {searchResults.map((user) => (
                    <ComboboxOption
                      key={user.id}
                      value={`user:${user.id}`}
                        className="flex items-center gap-2 w-full p-2 text-left hover:bg-accent"
                        onSelect={() => addUser(user)}
                    >
                        <Avatar name={user.display_name || user.username} size="small" />
                        <span className="text-sm">{user.display_name || user.username}</span>
                    </ComboboxOption>
                  ))}
              </ComboboxList>
            </div>
          </Combobox>
        </div>

        <div className="p-4 border-t border-border flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isCreating}>Cancel</Button>
          <Button
            type="button"
            variant="primary"
            loading={isCreating}
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
          >
            Create
          </Button>
        </div>
    </Dialog>
  );
}
