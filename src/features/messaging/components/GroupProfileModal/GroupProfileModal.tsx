import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  BellOff,
  Loader2,
  Search,
  UserPlus,
  Users,
  X,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  roomsApi,
  type GovernanceMember,
  type GroupNotificationPreferences,
} from "@/api/rooms";
import { Avatar } from "@/shared/components/Avatar";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import type { RoomPreview } from "@/shared/types";
import { roomRef } from "@/shared/utils/refs";
import { GroupMemberPicker } from "./GroupMemberPicker";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { Button } from "@/shared/components/Button";
import { useAppStore, type RootState } from "@/store";
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
  const addMemberButtonRef = useRef<HTMLButtonElement>(null);
  const requestVersion = useRef(0);
  const [members, setMembers] = useState<GovernanceMember[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [governance, setGovernance] = useState<Awaited<
    ReturnType<typeof roomsApi.governance>
  > | null>(null);
  const [governanceLoading, setGovernanceLoading] = useState(true);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [notifications, setNotifications] =
    useState<GroupNotificationPreferences | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const socketManager = useAppStore((state: RootState) => state.socketManager);

  const closeMemberPicker = () => {
    setAddMemberOpen(false);
    window.setTimeout(() => addMemberButtonRef.current?.focus(), 0);
  };

  const loadMembers = async (): Promise<GovernanceMember[]> => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const nextMembers = await roomsApi.governanceMembers(
        roomRef(room) ?? room.id,
      );
      if (version === requestVersion.current) {
        setMembers(nextMembers);
      }
      return nextMembers;
    } catch (reason: unknown) {
      if (version === requestVersion.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load group members.",
        );
      }
      throw reason;
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers().catch(() => undefined);
    return () => {
      requestVersion.current += 1;
    };
  }, [room.id, room.public_id]);

  useEffect(() => {
    let active = true;
    void roomsApi
      .getNotifications?.(roomRef(room) ?? room.id)
      ?.then((next) => {
        if (active) setNotifications(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [room.id, room.public_id]);

  const toggleMute = async () => {
    if (!notifications || notificationBusy) return;
    setNotificationBusy(true);
    try {
      const next = await roomsApi.updateNotifications(
        roomRef(room) ?? room.id,
        {
          muted_until: notifications.muted ? null : "9999-12-31T23:59:59Z",
          sound_enabled: notifications.sound_enabled,
          tone: notifications.tone,
        },
      );
      setNotifications(next);
    } finally {
      setNotificationBusy(false);
    }
  };

  const clearHistory = async () => {
    setNotificationBusy(true);
    try {
      await roomsApi.clearHistory(roomRef(room) ?? room.id);
      setConfirmClear(false);
    } finally {
      setNotificationBusy(false);
    }
  };

  useEffect(() => {
    if (!socketManager) return;
    let active = true;
    const unsubscribe = socketManager.onGroupGovernanceChanged((event) => {
      if (event.room_id !== room.id) return;
      void roomsApi
        .governance(roomRef(room) ?? room.id)
        .then((next) => {
          if (!active) return;
          setGovernance(next);
          if (!next.action_capabilities?.add_users) setAddMemberOpen(false);
        })
        .catch(() => undefined);
      void loadMembers().catch(() => undefined);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [room.id, room.public_id, socketManager]);

  useEffect(() => {
    let active = true;
    setGovernanceLoading(true);
    setGovernance(null);
    void roomsApi
      .governance(roomRef(room) ?? room.id)
      .then((next) => {
        if (active) setGovernance(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setGovernanceLoading(false);
      });
    return () => {
      active = false;
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
  const canManage =
    !governanceLoading &&
    governance !== null &&
    (governance.role === "owner" ||
      governance.action_capabilities?.manage_member_permissions === true ||
      governance.action_capabilities?.edit_own_tags === true);
  const canAddMember =
    !governanceLoading &&
    governance !== null &&
    governance.action_capabilities?.add_users === true;
  const actions = [
    ...(notifications ? [{
      label: notifications.muted ? "Unmute" : "Mute",
      icon: notifications.muted ? <Bell className="h-4 w-4" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />,
      onClick: () => void toggleMute(),
    }] : []),
    {
      label: "Search",
      icon: <Search className="h-4 w-4" aria-hidden="true" />,
      onClick: onSearchMessages,
    },
    ...(canManage
      ? [
          {
            label: "Manage",
            icon: <Settings2 className="h-4 w-4" aria-hidden="true" />,
            onClick: onManage,
          },
        ]
      : []),
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
        <section
          data-testid="group-profile-header"
          className="relative shrink-0 px-5 pb-4 pt-6"
        >
          <div className="absolute right-3 top-3">
            <IconButton
              label="Close group profile"
              size="compact"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {notifications?.sound_enabled === false
                ? "Notifications on · sound off"
                : notifications?.muted
                  ? "Notifications muted"
                  : "Notifications on"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              disabled={notificationBusy}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear history
            </Button>
          </div>
          <div className="flex flex-col items-center text-center">
            <Avatar
              name={room.name}
              src={room.avatar_url ?? null}
              size="large"
              className="h-20 w-20 text-2xl"
            />
            <h2
              id={titleId}
              className="mt-2.5 max-w-full truncate text-base font-semibold"
            >
              {room.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          <div
            className="mt-4 flex gap-[10px]"
            role="group"
            aria-label="Group actions"
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={action.onClick}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </section>

        {room.description && (
          <GroupManagementSection
            separated
            className="py-4"
            aria-label="Group description"
          >
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {room.description}
            </p>
          </GroupManagementSection>
        )}

        <div
          data-testid="group-profile-section-separator"
          className="h-2 shrink-0 border-y border-border bg-muted/30"
          aria-hidden="true"
        />
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border bg-muted/30">
            <div className="flex min-h-11 items-center justify-between gap-2 px-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden="true" /> Members{" "}
                <span className="font-normal normal-case">({memberCount})</span>
              </span>
              {canAddMember && (
                <IconButton
                  ref={addMemberButtonRef}
                  label="Add member"
                  size="compact"
                  onClick={() => setAddMemberOpen(true)}
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              )}
            </div>
            <div className="relative px-5 pb-3">
              <Search
                className="pointer-events-none absolute left-8 top-[18px] h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
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
              <div
                className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground"
                role="status"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading members…
              </div>
            )}
            {!loading && error && (
              <div
                className="flex flex-col items-center gap-3 px-5 py-8 text-center"
                role="alert"
              >
                <AlertCircle
                  className="h-5 w-5 text-destructive"
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">{error}</p>
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => void loadMembers().catch(() => undefined)}
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && filteredMembers.length === 0 && (
              <p
                className="px-5 py-8 text-center text-sm text-muted-foreground"
                role="status"
              >
                {query.trim()
                  ? "No members match your search."
                  : "No members found."}
              </p>
            )}
            {!loading && !error && filteredMembers.length > 0 && (
              <ul aria-label="Group members" className="divide-y divide-border">
                {filteredMembers.map((member) => (
                  <li
                    key={member.id}
                    className="flex min-h-[62px] items-center gap-3 px-5 py-2"
                  >
                    <Avatar
                      name={memberName(member)}
                      size="medium"
                      className="h-11 w-11"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {memberName(member)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{member.username}
                        {member.member_tag ? ` · ${member.member_tag}` : ""}
                        {member.admin_title ? ` · ${member.admin_title}` : ""}
                      </p>
                    </div>
                    {member.role !== "member" && (
                      <span
                        className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium capitalize text-primary"
                        aria-label={`${member.role} role`}
                      >
                        {member.role}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </GroupManagementScrollBody>
        </section>
      </GroupManagementFrame>
      {confirmClear && (
        <ConfirmModal
          title="Clear your history?"
          message="Only your copy of this group's history will be hidden. Other members keep their messages. This cannot be undone."
          confirmLabel="Clear history"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => void clearHistory()}
          isLoading={notificationBusy}
          isDanger
        />
      )}
      {addMemberOpen && (
        <GroupMemberPicker
          roomRef={roomRef(room) ?? room.id}
          existingMemberIds={new Set(members.map((member) => member.id))}
          onMembershipRefresh={loadMembers}
          onClose={closeMemberPicker}
        />
      )}
    </>
  );
}
