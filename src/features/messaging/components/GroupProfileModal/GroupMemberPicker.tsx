import { useEffect, useId, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { authApi } from "@/api/auth";
import { roomsApi } from "@/api/rooms";
import { Dialog } from "@/shared/components/Dialog";
import { TextInput } from "@/shared/components/Field";
import type { ResourceRef } from "@/shared/types";
import {
  GroupManagementHeader,
  GroupManagementPersonRow,
} from "../GroupManagement/GroupManagementLayout";

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
  const availableResults = results.filter((user) => !existingMemberIds.has(user.id));
  const normalizedQuery = query.trim();

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      className="flex w-full max-w-[360px] max-h-[calc(100dvh-32px)] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl"
    >
        <GroupManagementHeader
          title="Add member"
          titleId={titleId}
          closeLabel="Close add member"
          onClose={onClose}
        />
        <div className="shrink-0 border-b border-border px-5 py-3" data-testid="group-member-picker-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <TextInput aria-label="Search users to add" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full pl-9" />
          </div>
        </div>
        <div
          className="min-h-32 flex-1 overflow-x-hidden overflow-y-auto px-5 py-2"
          data-testid="group-member-picker-results"
        >
          {normalizedQuery.length < 2 && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">Enter at least 2 characters to search.</p>}
          {loading && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">Searching…</p>}
          {error && <p className="px-3 py-6 text-center text-sm text-destructive" role="alert">{error}</p>}
          {!loading && !error && normalizedQuery.length >= 2 && availableResults.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">No users found.</p>}
          {!loading && !error && availableResults.length > 0 && (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
            {availableResults.map((user) => {
              const name = user.display_name || user.username;
              return (
                <GroupManagementPersonRow
                  key={user.id}
                  name={name}
                  secondary={`@${user.username}`}
                  avatarSrc={user.avatar_url}
                  trailing={<UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                  disabled={addingId !== null}
                  onClick={() => void addMember(user.id)}
                />
              );
            })}
            </div>
          )}
          </div>
    </Dialog>
  );
}
