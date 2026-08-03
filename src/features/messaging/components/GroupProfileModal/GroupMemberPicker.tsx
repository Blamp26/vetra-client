import { useEffect, useId, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/base";
import { roomsApi, type GovernanceMember } from "@/api/rooms";
import { Avatar } from "@/shared/components/Avatar";
import { Button } from "@/shared/components/Button";
import { Dialog } from "@/shared/components/Dialog";
import { TextInput } from "@/shared/components/Field";
import type { ResourceRef } from "@/shared/types";
import {
  GroupManagementFooter,
  GroupManagementHeader,
  GroupManagementPersonRow,
} from "../GroupManagement/GroupManagementLayout";

type SearchUser = Awaited<ReturnType<typeof authApi.searchUsers>>["users"][number];

interface GroupMemberPickerProps {
  roomRef: ResourceRef;
  existingMemberIds: Set<number>;
  onMembershipRefresh: () => Promise<GovernanceMember[]>;
  onClose: () => void;
}

export function GroupMemberPicker({ roomRef, existingMemberIds, onMembershipRefresh, onClose }: GroupMemberPickerProps) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser[]>([]);
  const [knownMemberIds, setKnownMemberIds] = useState(() => new Set(existingMemberIds));
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKnownMemberIds((current) => new Set([...current, ...existingMemberIds]));
    setSelected((current) => current.filter((user) => !existingMemberIds.has(user.id)));
  }, [existingMemberIds]);

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
        .catch(() => {
          if (active) setError("Could not search users. Please try again.");
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

  const closeSafely = () => {
    if (!submittingRef.current) onClose();
  };

  const toggleSelected = (user: SearchUser) => {
    if (submittingRef.current || knownMemberIds.has(user.id)) return;
    setError(null);
    setSelected((current) =>
      current.some((item) => item.id === user.id)
        ? current.filter((item) => item.id !== user.id)
        : [...current, user],
    );
  };

  const submit = async () => {
    if (submittingRef.current || selected.length === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const submission = [...selected];
    const completedRequestIds = new Set<number>();
    let rateLimited = false;
    for (const user of submission) {
      try {
        await roomsApi.addMember(roomRef, user.id);
        completedRequestIds.add(user.id);
      } catch (reason: unknown) {
        if (reason instanceof ApiError && reason.statusCode === 429) {
          rateLimited = true;
          break;
        }
        // An ordinary per-user failure does not prevent later selections from
        // receiving their own server-authorized attempt.
      }
    }

    let refreshedMembers: GovernanceMember[] | null = null;
    try {
      refreshedMembers = await onMembershipRefresh();
    } catch {
      // Individual successful requests are still authoritative. Failed requests
      // remain selected when a refresh cannot prove an already-member race.
    }

    const refreshedIds = new Set(refreshedMembers?.map((member) => member.id) ?? []);
    const completedIds = new Set(
      submission
        .filter((user) => completedRequestIds.has(user.id) || refreshedIds.has(user.id))
        .map((user) => user.id),
    );

    if (refreshedMembers) {
      setKnownMemberIds((current) => new Set([...current, ...refreshedIds]));
    }
    const remaining = submission.filter((user) => !completedIds.has(user.id));
    setSelected(remaining);

    const completedCount = completedIds.size;
    if (remaining.length === 0) {
      submittingRef.current = false;
      setSubmitting(false);
      onClose();
      return;
    }

    setError(
      rateLimited
        ? `${completedCount > 0 ? `${completedCount} ${completedCount === 1 ? "member was" : "members were"} added. ` : ""}Too many member changes were requested. Please wait before trying the remaining ${remaining.length} ${remaining.length === 1 ? "member" : "members"} again.`
        : completedCount > 0
        ? `${completedCount} ${completedCount === 1 ? "member was" : "members were"} added. ${remaining.length} could not be added; review the selection and try again.`
        : `Could not add ${remaining.length === 1 ? "the selected member" : "the selected members"}. Review the selection and try again.`,
    );
    submittingRef.current = false;
    setSubmitting(false);
  };

  const availableResults = results.filter((user) => !knownMemberIds.has(user.id));
  const selectedIds = new Set(selected.map((user) => user.id));
  const normalizedQuery = query.trim();

  return (
    <Dialog
      open
      onClose={closeSafely}
      labelledBy={titleId}
      initialFocusRef={searchRef}
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      className="flex w-full max-w-[360px] max-h-[calc(100dvh-32px)] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl"
    >
      <GroupManagementHeader title="Add members" titleId={titleId} closeLabel="Close add members" onClose={closeSafely} />
      <div className="shrink-0 border-b border-border px-5 py-3" data-testid="group-member-picker-search">
        {selected.length > 0 && (
          <div className="mb-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto" aria-label="Selected members">
            {selected.map((user) => {
              const name = user.display_name || user.username;
              return (
                <span key={user.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-1 text-xs">
                  <Avatar name={name} src={user.avatar_url} size="small" className="h-5 w-5" />
                  <span className="max-w-40 truncate">{name}</span>
                  <button type="button" aria-label={`Remove ${name}`} disabled={submitting} onClick={() => toggleSelected(user)} className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <TextInput ref={searchRef} aria-label="Search users to add" placeholder="Search users" value={query} disabled={submitting} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full pl-9" />
        </div>
      </div>
      <div className="min-h-32 flex-1 overflow-x-hidden overflow-y-auto px-5 py-2" data-testid="group-member-picker-results">
        {normalizedQuery.length < 2 && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">Enter at least 2 characters to search.</p>}
        {loading && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">Searching…</p>}
        {error && <p className="px-3 py-6 text-center text-sm text-destructive" role="alert">{error}</p>}
        {!loading && !error && normalizedQuery.length >= 2 && availableResults.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">No users found.</p>}
        {!loading && !error && availableResults.length > 0 && (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
            {availableResults.map((user) => {
              const name = user.display_name || user.username;
              const isSelected = selectedIds.has(user.id);
              return (
                <GroupManagementPersonRow
                  key={user.id}
                  name={name}
                  secondary={`@${user.username}`}
                  avatarSrc={user.avatar_url}
                  trailing={isSelected ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
                  disabled={submitting}
                  onClick={() => toggleSelected(user)}
                />
              );
            })}
          </div>
        )}
      </div>
      <GroupManagementFooter>
        <Button variant="secondary" disabled={submitting} onClick={closeSafely}>Cancel</Button>
        <Button variant="primary" loading={submitting} disabled={selected.length === 0} onClick={() => void submit()}>Add</Button>
      </GroupManagementFooter>
    </Dialog>
  );
}
