import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Search, UserPlus, Users, X, Settings2 } from "lucide-react";
import { roomsApi, type GovernanceMember } from "@/api/rooms";
import { Avatar } from "@/shared/components/Avatar";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import type { RoomPreview } from "@/shared/types";
import { roomRef } from "@/shared/utils/refs";
import { GroupMemberPicker } from "./GroupMemberPicker";
import {
  GroupManagementFrame,
  GroupManagementScrollBody,
  GroupManagementSection,
} from "../GroupManagement/GroupManagementLayout";

interface GroupProfileModalProps {
  room: RoomPreview;
  onClose: () => void;
  onSearchMessages: () => void;
  onManage?: () => void;
}

function memberName(member: GovernanceMember) {
  return member.display_name?.trim() || member.username;
}

export function GroupProfileModal({
  room,
  onClose,
  onSearchMessages,
  onManage = () => undefined,
}: GroupProfileModalProps) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const [members, setMembers] = useState<GovernanceMember[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [governance, setGovernance] = useState<Awaited<ReturnType<typeof roomsApi.governance>> | null>(null);
  const [governanceLoading, setGovernanceLoading] = useState(true);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

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

  useEffect(() => {
    let active = true;
    setGovernanceLoading(true);
    setGovernance(null);
    void roomsApi.governance(roomRef(room) ?? room.id)
      .then((next) => { if (active) setGovernance(next); })
      .catch(() => undefined)
      .finally(() => { if (active) setGovernanceLoading(false); });
    return () => { active = false; };
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
  const canManage = !governanceLoading && governance !== null && (
    governance.role === "owner" ||
    governance.capabilities.some((capability) => ["remove_members", "manage_member_permissions"].includes(capability))
  );
  const canAddMember = !governanceLoading && governance !== null && (
    governance.role === "owner" || governance.capabilities.includes("invite_members")
  );
  const actions = [
    { label: "Search", icon: <Search className="h-4 w-4" aria-hidden="true" />, onClick: onSearchMessages },
    ...(canManage ? [{ label: "Manage", icon: <Settings2 className="h-4 w-4" aria-hidden="true" />, onClick: onManage }] : []),
  ];

  return (
    <>
    <GroupManagementFrame
      width="profile"
      onClose={onClose}
      inert={addMemberOpen}
      labelledBy={titleId}
      initialFocusRef={searchRef}
    >
        <section data-testid="group-profile-header" className="relative shrink-0 px-5 pb-4 pt-6">
          <div className="absolute right-3 top-3">
            <IconButton label="Close group profile" size="compact" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
          <div className="flex flex-col items-center text-center">
            <Avatar
              name={room.name}
              src={room.avatar_url ?? null}
              size="large"
              className="h-20 w-20 text-2xl"
            />
            <h2 id={titleId} className="mt-2.5 max-w-full truncate text-base font-semibold">
              {room.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          <div className="mt-4 flex gap-[10px]" role="group" aria-label="Group actions">
            {actions.map((action) => (
              <button key={action.label} type="button" className="flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={action.onClick}>
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </section>

        {room.description && (
          <GroupManagementSection separated className="py-4" aria-label="Group description">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{room.description}</p>
          </GroupManagementSection>
        )}

        <div data-testid="group-profile-section-separator" className="h-2 shrink-0 border-y border-border bg-muted/30" aria-hidden="true" />
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border bg-muted/30">
            <div className="flex min-h-11 items-center justify-between gap-2 px-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-2"><Users className="h-4 w-4" aria-hidden="true" /> Members <span className="font-normal normal-case">({memberCount})</span></span>
              {canAddMember && <IconButton label="Add member" size="compact" onClick={() => setAddMemberOpen(true)}><UserPlus className="h-4 w-4" aria-hidden="true" /></IconButton>}
            </div>
            <div className="relative px-5 pb-3">
              <Search className="pointer-events-none absolute left-8 top-[18px] h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
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
          <GroupManagementScrollBody data-testid="group-profile-member-list">
          {loading && (
            <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading members…
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 px-5 py-8 text-center" role="alert">
              <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={loadMembers}>
                Retry
              </button>
            </div>
          )}
          {!loading && !error && filteredMembers.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground" role="status">
              {query.trim() ? "No members match your search." : "No members found."}
            </p>
          )}
          {!loading && !error && filteredMembers.length > 0 && (
            <ul aria-label="Group members" className="divide-y divide-border">
              {filteredMembers.map((member) => (
                <li key={member.id} className="flex min-h-[62px] items-center gap-3 px-5 py-2">
                  <Avatar name={memberName(member)} size="medium" className="h-11 w-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{memberName(member)}</p>
                    <p className="truncate text-xs text-muted-foreground">@{member.username}</p>
                  </div>
                  {member.role !== "member" && (
                    <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium capitalize text-primary" aria-label={`${member.role} role`}>{member.role}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          </GroupManagementScrollBody>
        </section>
    </GroupManagementFrame>
    {addMemberOpen && <GroupMemberPicker roomRef={roomRef(room) ?? room.id} existingMemberIds={new Set(members.map((member) => member.id))} onAdded={loadMembers} onClose={() => setAddMemberOpen(false)} />}
    </>
  );
}
