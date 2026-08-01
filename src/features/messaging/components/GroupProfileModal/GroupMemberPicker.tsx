import { useEffect, useId, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { authApi } from "@/api/auth";
import { roomsApi } from "@/api/rooms";
import { Avatar } from "@/shared/components/Avatar";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import type { ResourceRef } from "@/shared/types";

interface GroupMemberPickerProps {
  roomRef: ResourceRef;
  existingMemberIds: Set<number>;
  onAdded: () => void;
  onClose: () => void;
}

export function GroupMemberPicker({ roomRef, existingMemberIds, onAdded, onClose }: GroupMemberPickerProps) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof authApi.searchUsers>>["users"]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void authApi.searchUsers(normalized)
        .then((response) => {
          if (active) setResults(response.users);
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "Could not search users.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const addMember = async (userId: number | string) => {
    setAddingId(Number(userId));
    setError(null);
    try {
      await roomsApi.addMember(roomRef, userId);
      onAdded();
      onClose();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not add member.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open onClose={onClose} labelledBy={titleId} className="w-full max-w-[360px] rounded-xl border border-border bg-card p-0 shadow-xl">
      <div className="flex max-h-[min(560px,calc(100vh-32px))] flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold">Add member</h2>
          <IconButton label="Close add member" size="compact" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></IconButton>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <TextInput aria-label="Search users to add" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full pl-9" />
          </div>
          {loading && <p className="py-5 text-center text-sm text-muted-foreground" role="status">Searching…</p>}
          {error && <p className="py-3 text-sm text-destructive" role="alert">{error}</p>}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground" role="status">No users found.</p>}
          <div className="mt-2 max-h-80 overflow-y-auto">
            {results.filter((user) => !existingMemberIds.has(user.id)).map((user) => {
              const name = user.display_name || user.username;
              return (
                <button key={user.id} type="button" className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent disabled:opacity-60" disabled={addingId !== null} onClick={() => void addMember(user.id)}>
                  <Avatar name={name} src={user.avatar_url ?? undefined} size="small" />
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
