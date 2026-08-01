import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Search, Users, X } from "lucide-react";
import { roomsApi, type GovernanceMember } from "@/api/rooms";
import { Avatar } from "@/shared/components/Avatar";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import type { RoomPreview } from "@/shared/types";
import { roomRef } from "@/shared/utils/refs";

interface GroupProfileModalProps {
  room: RoomPreview;
  onClose: () => void;
  onSearchMessages: () => void;
}

function memberName(member: GovernanceMember) {
  return member.display_name?.trim() || member.username;
}

export function GroupProfileModal({
  room,
  onClose,
  onSearchMessages,
}: GroupProfileModalProps) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const [members, setMembers] = useState<GovernanceMember[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    void roomsApi
      .governanceMembers(roomRef(room) ?? room.id)
      .then((nextMembers) => {
        if (version !== requestVersion.current) return;
        setMembers(nextMembers);
      })
      .catch((reason: unknown) => {
        if (version !== requestVersion.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load group members.",
        );
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
  };

  useEffect(() => {
    loadMembers();
    return () => {
      requestVersion.current += 1;
    };
  }, [room.id, room.public_id]);

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return members;
    return members.filter((member) =>
      [member.display_name, member.username]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalized)),
    );
  }, [members, query]);

  const memberCount = members.length || room.members?.length || 0;

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={searchRef}
      overlayClassName="items-start pt-16"
      className="w-full max-w-[392px] max-h-[calc(100vh-128px)] overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl"
    >
      <div className="flex max-h-[calc(100vh-128px)] min-h-0 flex-col">
        <section data-testid="group-profile-header" className="relative shrink-0 px-[18px] pb-4 pt-6">
          <div className="absolute right-3 top-3">
            <IconButton label="Close group profile" size="compact" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
          <div className="flex flex-col items-center text-center">
            <Avatar
              name={room.name}
              size="large"
              className="h-20 w-20 text-2xl"
            />
            <h2 id={titleId} className="mt-3 max-w-full truncate text-base font-semibold">
              {room.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Group actions">
            <button
              type="button"
              className="flex h-[52px] w-[81px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onSearchMessages}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Search
            </button>
          </div>
        </section>

        <div data-testid="group-profile-section-separator" className="h-2 shrink-0 border-y border-border bg-muted/30" aria-hidden="true" />
        <section className="min-h-0 overflow-y-auto">
          <div className="border-b border-border bg-muted/30 px-[18px] py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden="true" />
              Members
            </div>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <TextInput
                ref={searchRef}
                aria-label="Search group members"
                placeholder="Search members"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full pl-9"
              />
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 px-[18px] py-8 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading members…
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 px-[18px] py-8 text-center" role="alert">
              <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={loadMembers}>
                Retry
              </button>
            </div>
          )}
          {!loading && !error && filteredMembers.length === 0 && (
            <p className="px-[18px] py-8 text-center text-sm text-muted-foreground" role="status">
              {query.trim() ? "No members match your search." : "No members found."}
            </p>
          )}
          {!loading && !error && filteredMembers.length > 0 && (
            <ul aria-label="Group members" className="divide-y divide-border">
              {filteredMembers.map((member) => (
                <li key={member.id} className="flex min-h-[58px] items-center gap-3 px-[18px] py-2">
                  <Avatar name={memberName(member)} size="medium" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{memberName(member)}</p>
                    <p className="truncate text-xs text-muted-foreground">@{member.username}</p>
                  </div>
                  {member.role !== "member" && (
                    <span className="shrink-0 text-xs capitalize text-muted-foreground">{member.role}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
