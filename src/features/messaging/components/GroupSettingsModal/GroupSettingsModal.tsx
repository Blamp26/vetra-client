import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronRight, Globe2, KeyRound, Link, LogOut, Shield, Trash2, Users } from "lucide-react";
import {
  roomsApi,
  type GovernanceMember,
  type GroupGovernance,
  type GroupAccessSettings,
  type GroupInvite,
  type GroupJoinRequest,
} from "@/api/rooms";
import { roomRef } from "@/shared/utils/refs";
import type { RoomPreview } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { TextInput } from "@/shared/components/Field";
import { AvatarCropDialog } from "../GroupBasicInfoEditor/AvatarCropDialog";
import {
  GroupBasicInfoFields,
  useGroupBasicInfoEditor,
} from "../GroupBasicInfoEditor/GroupBasicInfoEditor";
import {
  ADMIN_PERMISSION_KEYS,
  groupPermissionLabel,
  MEMBER_PERMISSION_KEYS,
} from "../GroupManagement/permissionLabels";
import {
  GroupManagementFooter,
  GroupManagementBooleanControl,
  GroupManagementControlRow,
  GroupManagementFrame,
  GroupManagementHeader,
  GroupManagementPersonRow,
  GroupManagementRow,
  GroupManagementScrollBody,
  GroupManagementSection,
  GroupManagementSubpage,
} from "../GroupManagement/GroupManagementLayout";

type GroupConfirmation =
  | { type: "demote"; member: GovernanceMember }
  | { type: "remove"; member: GovernanceMember }
  | { type: "transfer"; member: GovernanceMember }
  | { type: "leave" }
  | { type: "delete" };

export function GroupSettingsModal({
  room,
  onClose,
  onBack,
}: {
  room: RoomPreview;
  onClose: () => void;
  onBack?: () => void;
}) {
  const titleId = useId();
  const [state, setState] = useState<GroupGovernance | null>(null);
  const [selected, setSelected] = useState<GovernanceMember | null>(null);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [slowMode, setSlowMode] = useState(0);
  const [adminRights, setAdminRights] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [temporaryDenies, setTemporaryDenies] = useState<string[]>([]);
  const [restrictionDuration, setRestrictionDuration] = useState<"forever" | "day" | "week" | "custom">("forever");
  const [restrictionExpiresAt, setRestrictionExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mutationPending = useRef(false);
  const [confirmation, setConfirmation] = useState<GroupConfirmation | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [overrideDraft, setOverrideDraft] = useState<
    Record<string, "inherit" | "allow" | "deny">
  >({});
  const [view, setView] = useState<"overview" | "admins" | "members" | "permissions" | "access">("overview");
  const [access, setAccess] = useState<GroupAccessSettings | null>(null);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [requests, setRequests] = useState<GroupJoinRequest[]>([]);
  const [inviteName, setInviteName] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [inviteLimit, setInviteLimit] = useState("");
  const [inviteApproval, setInviteApproval] = useState(false);
  const socketManager = useAppStore((s: RootState) => s.socketManager);
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const ref = roomRef(room) ?? room.id;
  const basicInfo = useGroupBasicInfoEditor({ room, onClose });
  const descriptionId = useId();
  const reload = () =>
    roomsApi
      .governance(ref)
      .then((next) => {
        setState(next);
        setDefaults(next.defaults);
        setSlowMode(next.slow_mode_seconds ?? 0);
        setSelected((current) =>
          current
            ? (() => {
                const refreshed = next.members.find((member) => member.id === current.id);
                if (!refreshed) return null;
                const stillAuthorized = refreshed.can_manage || refreshed.can_edit_tag || refreshed.can_edit_admin || refreshed.can_restrict || refreshed.can_remove;
                return stillAuthorized ? refreshed : null;
              })()
            : null,
        );
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Could not load group settings.",
        ),
      );
  useEffect(() => {
    void reload();
    const unsubscribe = socketManager?.onGroupGovernanceChanged((event) => {
      if (event.room_id !== room.id) return;
      if (
        event.event === "group_deleted" ||
        ((event.event === "member_removed" || event.event === "member_left") &&
          event.user_id === currentUser?.id)
      ) {
        onClose();
        return;
      }
      if (["group_access_changed", "join_request_created", "join_request_resolved"].includes(event.event) && view === "access") void reloadAccess();
      void reload();
    });
    return unsubscribe;
  }, [room.id, socketManager, currentUser?.id, onClose]);
  const reloadAccess = async () => {
    const next = await roomsApi.access(ref);
    setAccess(next);
    if (next.capabilities.manage_invites) setInvites(await roomsApi.invites(ref));
    if (next.capabilities.moderate_requests) setRequests(await roomsApi.joinRequests(ref));
  };
  useEffect(() => { if (view === "access") void reloadAccess().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load group access policy.")); }, [view, room.id]);
  const saveAccess = async () => {
    if (!access) return; setBusy(true); setError(null);
    try { setAccess(await roomsApi.updateAccess(ref, access)); await reloadAccess(); }
    catch (reason) { await reloadAccess().catch(() => undefined); setError(reason instanceof Error ? reason.message : "Access policy update failed. Authority was refreshed."); }
    finally { setBusy(false); }
  };
  const createInvite = async () => {
    setBusy(true); setError(null);
    try { await roomsApi.createInvite(ref, { internal_name: inviteName || null, expires_at: inviteExpiry ? new Date(inviteExpiry).toISOString() : null, max_uses: inviteLimit ? Number(inviteLimit) : null, approval_required: inviteApproval }); setInviteName(""); setInviteExpiry(""); setInviteLimit(""); setInviteApproval(false); await reloadAccess(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Invite creation failed."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!memberQuery.trim()) {
      void reload();
      return;
    }
    const timer = window.setTimeout(() => {
      void roomsApi
        .governanceMembers(ref, memberQuery.trim())
        .then((members) =>
          setState((current) => (current ? { ...current, members } : current)),
        )
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [memberQuery, room.id, ref]);
  const admins = useMemo(
    () => state?.members.filter((m) => m.role === "admin") ?? [],
    [state],
  );
  const administrators = useMemo(
    () => state?.members.filter((m) => m.role === "owner" || m.role === "admin") ?? [],
    [state],
  );
  const ordinary = useMemo(
    () => state?.members.filter((m) => m.role === "member") ?? [],
    [state],
  );
  const beginMemberEdit = (member: GovernanceMember) => {
    setSelected(member);
    setTagDraft(member.member_tag ?? "");
    setTitleDraft(member.admin_title ?? "");
    setTemporaryDenies(member.temporary_restriction?.deny_permissions ?? []);
    setOverrideDraft(
      Object.fromEntries(
        MEMBER_PERMISSION_KEYS.map((right) => [
          right,
          member.deny_permissions.includes(right)
            ? "deny"
            : member.allow_permissions.includes(right)
              ? "allow"
              : "inherit",
        ]),
      ),
    );
  };
  const saveOverride = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await roomsApi.updateOverride(
        ref,
        selected.id,
        MEMBER_PERMISSION_KEYS.filter((right) => overrideDraft[right] === "allow"),
        MEMBER_PERMISSION_KEYS.filter((right) => overrideDraft[right] === "deny"),
      );
      await reload();
    } catch (e) {
      await reload();
      setSelected(null);
      setError(e instanceof Error ? e.message : "Member restriction update failed. Group authority was refreshed.");
    } finally {
      setBusy(false);
    }
  };
  const clearSelectedOverride = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await roomsApi.clearOverride(ref, selected.id);
      await reload();
    } catch (e) {
      await reload();
      setSelected(null);
      setError(e instanceof Error ? e.message : "Could not clear override. Group authority was refreshed.");
    } finally {
      setBusy(false);
    }
  };
  const saveDefaults = async () => {
    setBusy(true);
    setError(null);
    try {
      await roomsApi.updateDefaults(ref, defaults);
      if (state?.can_manage_slow_mode) await roomsApi.updateSlowMode(ref, slowMode);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permission update failed.");
    } finally {
      setBusy(false);
    }
  };
  const beginPromotion = (member: GovernanceMember) => {
    beginMemberEdit(member);
    setAdminRights([]);
  };
  const beginAdminEdit = (member: GovernanceMember) => {
    beginMemberEdit(member);
    setAdminRights(member.admin_permissions);
  };
  const refreshAfterUnsafeError = async (fallback: string, reason: unknown) => {
    await reload();
    setSelected(null);
    setError(reason instanceof Error ? reason.message : fallback);
  };
  const saveTag = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await roomsApi.updateMemberTag(ref, selected.id, tagDraft);
      await reload();
    } catch (reason) {
      await refreshAfterUnsafeError("Member tag update failed. Group authority was refreshed.", reason);
    } finally {
      setBusy(false);
    }
  };
  const saveTitle = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await roomsApi.updateAdminTitle(ref, selected.id, titleDraft);
      await reload();
    } catch (reason) {
      await refreshAfterUnsafeError("Administrator title update failed. Group authority was refreshed.", reason);
    } finally {
      setBusy(false);
    }
  };
  const saveTemporaryRestriction = async () => {
    if (!selected || busy || temporaryDenies.length === 0) return;
    setBusy(true);
    try {
      const expiresAt = restrictionDuration === "custom" && restrictionExpiresAt
        ? new Date(restrictionExpiresAt).toISOString()
        : undefined;
      await roomsApi.updateTemporaryRestriction(ref, selected.id, temporaryDenies, restrictionDuration, expiresAt);
      await reload();
    } catch (reason) {
      await refreshAfterUnsafeError("Temporary restriction update failed. Group authority was refreshed.", reason);
    } finally {
      setBusy(false);
    }
  };
  const clearTemporaryRestriction = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await roomsApi.clearTemporaryRestriction(ref, selected.id);
      setTemporaryDenies([]);
      await reload();
    } catch (reason) {
      await refreshAfterUnsafeError("Could not clear temporary restriction. Group authority was refreshed.", reason);
    } finally {
      setBusy(false);
    }
  };
  const saveAdmin = async () => {
    if (!selected || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (selected.role === "member") {
        await roomsApi.promote(ref, selected.id, adminRights);
      } else {
        await roomsApi.updateAdminRights(ref, selected.id, adminRights);
      }
      await reload();
      setSelected(null);
    } catch (e) {
      await reload();
      setSelected(null);
      setError(
        e instanceof Error
          ? e.message
          : selected.role === "member"
            ? "Promotion failed. Group authority was refreshed."
            : "Administrator update failed. Group authority was refreshed.",
      );
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  };
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  const leaveGroup = () => {
    if (!state?.can_leave) {
      setError("owner_cannot_leave");
      return;
    }
    setConfirmation({ type: "leave" });
  };
  const deleteGroup = () => {
    if (!state?.can_delete_group) return;
    setConfirmation({ type: "delete" });
  };
  const confirmAction = async () => {
    if (!confirmation || busy || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true);
    try {
      if (confirmation.type === "demote") {
        await roomsApi.demote(ref, confirmation.member.id);
        await reload();
      } else if (confirmation.type === "remove") {
        await roomsApi.removeMember(ref, confirmation.member.id);
        setSelected(null);
        await reload();
      } else if (confirmation.type === "transfer") {
        await roomsApi.transferOwnership(ref, confirmation.member.id);
        setSelected(null);
        await reload();
      } else if (confirmation.type === "leave") {
        await roomsApi.leave(ref);
        onClose();
      } else {
        await roomsApi.delete(ref);
        onClose();
      }
    } catch (e) {
      const fallback = confirmation.type === "remove"
          ? "Member removal failed."
          : confirmation.type === "transfer"
            ? "Ownership transfer failed. Group authority was refreshed."
          : confirmation.type === "leave"
            ? "Leave failed."
            : "Delete failed.";
      if (["demote", "remove", "transfer"].includes(confirmation.type)) {
        await reload();
        setSelected(null);
      }
      setError(
        confirmation.type === "demote"
          ? (e as { message: string }).message
          : e instanceof Error
            ? e.message
            : fallback,
      );
    } finally {
      mutationPending.current = false;
      setBusy(false);
      setConfirmation(null);
    }
  };
  const confirmationCopy = confirmation
    ? confirmation.type === "demote"
      ? { title: "Demote administrator?", message: `${confirmation.member.display_name ?? confirmation.member.username} will become a regular group member.`, confirmLabel: "Demote" }
      : confirmation.type === "remove"
        ? { title: "Remove member?", message: `Remove ${confirmation.member.display_name ?? confirmation.member.username} from this group?`, confirmLabel: "Remove" }
        : confirmation.type === "transfer"
          ? { title: "Transfer ownership?", message: `${confirmation.member.display_name ?? confirmation.member.username} will become the owner. You will become an administrator with full rights.`, confirmLabel: "Transfer" }
        : confirmation.type === "leave"
          ? { title: "Leave group?", message: "You will leave this group and lose access to its messages.", confirmLabel: "Leave" }
          : { title: "Delete group?", message: "This group and its messages will be permanently deleted.", confirmLabel: "Delete" }
    : null;
  const headerTitle = view === "overview"
    ? "Edit group"
    : view === "admins"
      ? "Administrators"
      : view === "members"
        ? "Members"
      : view === "permissions" ? "Member permissions" : "Group access";
  const canChangeGroupInfo = state?.role === "owner" || state?.action_capabilities?.change_group_info === true;
  return (
    <>
    <GroupManagementFrame
      width="settings"
      onClose={onClose}
      labelledBy={titleId}
      contentClassName={view === "overview" ? undefined : "min-h-[min(520px,calc(100dvh-96px))]"}
    >
      <div className="contents" data-testid="group-management-dialog">
        <GroupManagementHeader
          title={headerTitle}
          titleId={titleId}
          closeLabel="Close edit group"
          onClose={onClose}
          backLabel={view === "overview" ? "Back to group profile" : "Back to group management"}
          onBack={view === "overview" ? onBack : () => setView("overview")}
        />
        {error && (
          <div role="alert" className="shrink-0 px-5 pt-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!state ? (
          <p className="min-h-0 flex-1 px-5 py-6 text-sm text-muted-foreground" role="status">Loading…</p>
        ) : (
          <GroupManagementScrollBody ref={basicInfo.editorRef} tabIndex={-1} data-testid="group-settings-scroll-body">
            {view === "overview" && (
              <>
                {canChangeGroupInfo && <GroupBasicInfoFields room={room} titleId={titleId} descriptionId={descriptionId} controller={basicInfo} />}
                <GroupManagementSection separated className="p-0" aria-label="Group management navigation">
                <nav aria-label="Group management sections">
                  <GroupManagementRow label="Administrators" leading={<Shield className="h-4 w-4 text-muted-foreground" />} trailing={<><span>{administrators.length}</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></>} onClick={() => setView("admins")} />
                  <GroupManagementRow label="Members" leading={<Users className="h-4 w-4 text-muted-foreground" />} trailing={<><span>{state.members.length}</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></>} onClick={() => setView("members")} />
                  <GroupManagementRow label="Member permissions" leading={<KeyRound className="h-4 w-4 text-muted-foreground" />} trailing={<ChevronRight className="h-4 w-4" aria-hidden="true" />} onClick={() => setView("permissions")} />
                  <GroupManagementRow label="Type, history and invite links" leading={<Globe2 className="h-4 w-4 text-muted-foreground" />} trailing={<ChevronRight className="h-4 w-4" aria-hidden="true" />} onClick={() => setView("access")} />
                </nav>
                </GroupManagementSection>
                <GroupManagementSection separated className="p-0" aria-label="Group actions">
                  {state.can_leave && <GroupManagementRow label="Leave group" leading={<LogOut className="h-4 w-4" />} onClick={leaveGroup} />}
                  {state.can_delete_group && <GroupManagementRow label="Delete group" leading={<Trash2 className="h-4 w-4" />} tone="destructive" disabled={busy} onClick={deleteGroup} />}
                </GroupManagementSection>
              </>
            )}
            {view === "admins" && (
              <GroupManagementSubpage data-testid="group-admins-subpage">
                <p className="text-xs text-muted-foreground">Manage administrator access and rights.</p>
                <section className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background" aria-label="Current administrators">
                  {state.members.filter((m) => m.role === "owner").map((m) => (
                    <GroupManagementPersonRow key={m.id} name={m.display_name ?? m.username} secondary={m.member_tag ? `Owner · ${m.member_tag}` : "Owner"} trailing={m.can_edit_tag ? <Button type="button" variant="ghost" size="compact" className="px-2" onClick={() => beginAdminEdit(m)}>Edit tag</Button> : undefined} />
                  ))}
                  {admins.map((m) => (
                    <GroupManagementPersonRow
                      key={m.id}
                      name={m.display_name ?? m.username}
                      secondary={m.admin_title ? `Administrator · ${m.admin_title}` : "Administrator"}
                      trailing={
                        <>
                          <Button type="button" variant="ghost" size="compact" className="px-2" disabled={!m.can_edit_admin || busy} onClick={() => beginAdminEdit(m)}>Edit rights</Button>
                          <Button type="button" variant="ghost" size="compact" className="px-2 text-destructive" disabled={!(m.can_demote ?? state.role === "owner") || busy} onClick={() => setConfirmation({ type: "demote", member: m })}>Demote</Button>
                        </>
                      }
                    />
                  ))}
                </section>
                {ordinary.length > 0 && (
                  <section aria-labelledby={`${titleId}-eligible-members`}>
                    <h3 id={`${titleId}-eligible-members`} className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</h3>
                    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
                      {ordinary.map((m) => (
                        <GroupManagementPersonRow key={m.id} name={m.display_name ?? m.username} secondary="Member" trailing={(m.can_promote ?? state.role === "owner") ? <Button type="button" variant="ghost" size="compact" className="px-2 text-primary" disabled={busy} onClick={() => beginPromotion(m)}>Promote</Button> : undefined} />
                      ))}
                    </div>
                  </section>
                )}
                {selected && (
                  <section aria-labelledby={`${titleId}-admin-rights`}>
                    <div className="mb-2">
                      <h3 id={`${titleId}-admin-rights`} className="text-sm font-semibold">Administrator rights</h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{selected.display_name ?? selected.username}</p>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border bg-background divide-y divide-border">
                      {ADMIN_PERMISSION_KEYS.map((right) => {
                        const controlId = `${titleId}-admin-${right}`;
                        const disabled = busy || !(state.delegable_admin_permissions ?? (state.role === "owner" ? [...ADMIN_PERMISSION_KEYS] : [])).includes(right);
                        return <GroupManagementControlRow key={right} label={groupPermissionLabel(right)} htmlFor={controlId} disabled={disabled} control={<GroupManagementBooleanControl id={controlId} disabled={disabled} checked={adminRights.includes(right)} onChange={() => setAdminRights(toggle(adminRights, right))} />} />;
                      })}
                    </div>
                    {selected.can_edit_tag && <div className="mt-3 flex items-end gap-2"><label className="min-w-0 flex-1 text-xs text-muted-foreground">Member tag<TextInput value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="Optional member tag" size="compact" /></label><Button type="button" variant="ghost" size="compact" disabled={busy} onClick={() => void saveTag()}>Save tag</Button></div>}
                    {selected.role === "admin" && selected.can_manage && <div className="mt-4 border-t border-border pt-3"><h4 className="text-sm font-semibold">Ordinary-member exception</h4><p className="mt-1 text-xs text-muted-foreground">Effective: {selected.effective_permissions?.map(groupPermissionLabel).join(", ") || "none"}</p><div className="mt-2 overflow-hidden rounded-lg border border-border bg-background divide-y divide-border">{MEMBER_PERMISSION_KEYS.map((right) => <GroupManagementControlRow key={right} label={groupPermissionLabel(right)} control={<select className="vt-select !w-28 !py-1 text-sm" aria-label={`${groupPermissionLabel(right)} override`} value={overrideDraft[right] ?? "inherit"} onChange={(event) => setOverrideDraft((current) => ({ ...current, [right]: event.target.value as "inherit" | "allow" | "deny" }))}><option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option></select>} />)}</div><div className="mt-3 flex gap-2"><Button type="button" variant="primary" size="compact" disabled={busy} onClick={() => void saveOverride()}>Save exception</Button><Button type="button" variant="ghost" size="compact" disabled={busy} onClick={() => void clearSelectedOverride()}>Remove exception</Button></div></div>}
                    {selected.role === "admin" && selected.can_edit_title && <div className="mt-3 flex items-end gap-2"><label className="min-w-0 flex-1 text-xs text-muted-foreground">Administrator title<TextInput value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} placeholder="Optional public title" size="compact" /></label><Button type="button" variant="ghost" size="compact" disabled={busy} onClick={() => void saveTitle()}>Save title</Button></div>}
                    <div className="mt-3 flex justify-end">
                      <Button type="button" variant="primary" size="compact" disabled={busy || (selected.role === "member" ? !(selected.can_promote ?? state.role === "owner") : !(selected.can_edit_admin ?? state.role === "owner"))} onClick={() => void saveAdmin()}>{selected.role === "member" ? "Promote" : "Save rights"}</Button>
                    </div>
                    {selected.can_transfer_ownership && <div className="mt-3 border-t border-border pt-3"><Button type="button" variant="ghost" size="compact" disabled={busy} onClick={() => setConfirmation({ type: "transfer", member: selected })}>Transfer ownership</Button></div>}
                    {selected.can_remove && selected.role === "admin" && <div className="mt-3"><Button type="button" variant="ghost" size="compact" className="text-destructive" disabled={busy} onClick={() => setConfirmation({ type: "remove", member: selected })}>Remove administrator</Button></div>}
                  </section>
                )}
              </GroupManagementSubpage>
            )}
            {view === "members" && (
              <GroupManagementSubpage data-testid="group-members-subpage">
                <label className="block text-sm">
                  <span className="sr-only">Search members</span>
                  <TextInput
                    value={memberQuery}
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder="Search members"
                    size="compact"
                  />
                </label>
                <section className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background" aria-label="Group members">
                  {state.members.map((m) => m.role === "member"
                    ? <GroupManagementPersonRow key={m.id} name={m.display_name ?? m.username} secondary={m.member_tag ? `${m.member_tag} · ${m.effective_permissions?.length ?? 0} effective permissions` : `${m.effective_permissions?.length ?? 0} effective permissions`} onClick={() => beginMemberEdit(m)} />
                    : <GroupManagementPersonRow key={m.id} name={m.display_name ?? m.username} secondary={m.admin_title ?? (m.role === "owner" ? "Owner" : "Administrator")} onClick={(m.can_edit_tag || m.can_edit_admin) ? () => beginAdminEdit(m) : undefined} />)}
                </section>
                {selected?.role === "member" && (
                  <section aria-labelledby={`${titleId}-member-restrictions`}>
                    <div className="mb-2">
                      <h3 id={`${titleId}-member-restrictions`} className="text-sm font-semibold">Member restrictions</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Effective: {selected.effective_permissions?.map(groupPermissionLabel).join(", ") || "none"}</p>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border bg-background divide-y divide-border">
                      {MEMBER_PERMISSION_KEYS.map((right) => (
                        <GroupManagementControlRow key={right} label={groupPermissionLabel(right)} control={<select className="vt-select !w-28 !py-1 text-sm" aria-label={`${groupPermissionLabel(right)} override`} value={overrideDraft[right] ?? "inherit"} onChange={(event) => setOverrideDraft((current) => ({ ...current, [right]: event.target.value as "inherit" | "allow" | "deny" }))}><option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option></select>} />
                      ))}
                    </div>
                    {selected.can_edit_tag && <div className="mt-3 flex items-end gap-2"><label className="min-w-0 flex-1 text-xs text-muted-foreground">Member tag<TextInput value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="Optional member tag" size="compact" /></label><Button type="button" variant="ghost" size="compact" disabled={busy} onClick={() => void saveTag()}>Save tag</Button></div>}
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="primary" size="compact" disabled={busy || !selected.can_manage} onClick={() => void saveOverride()}>Save restrictions</Button>
                      <Button type="button" variant="ghost" size="compact" disabled={busy || !selected.can_manage} onClick={() => void clearSelectedOverride()}>Clear override</Button>
                    </div>
                    {selected.can_restrict && <div className="mt-4 border-t border-border pt-3"><h4 className="text-sm font-semibold">Temporary restriction</h4><div className="mt-2 overflow-hidden rounded-lg border border-border bg-background divide-y divide-border">{MEMBER_PERMISSION_KEYS.map((right) => { const id = `${titleId}-temporary-${right}`; return <GroupManagementControlRow key={right} label={groupPermissionLabel(right)} htmlFor={id} control={<GroupManagementBooleanControl id={id} disabled={busy} checked={temporaryDenies.includes(right)} onChange={() => setTemporaryDenies(toggle(temporaryDenies, right))} />} />; })}</div><div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs text-muted-foreground">Duration<select className="vt-select mt-1 block !w-32 !py-1 text-sm" value={restrictionDuration} onChange={(event) => setRestrictionDuration(event.target.value as typeof restrictionDuration)}><option value="forever">Forever</option><option value="day">1 day</option><option value="week">1 week</option><option value="custom">Custom</option></select></label>{restrictionDuration === "custom" && <label className="text-xs text-muted-foreground">Until<input type="datetime-local" className="vt-input mt-1 block" value={restrictionExpiresAt} onChange={(event) => setRestrictionExpiresAt(event.target.value)} /></label>}<Button type="button" variant="primary" size="compact" disabled={busy || temporaryDenies.length === 0 || (restrictionDuration === "custom" && !restrictionExpiresAt)} onClick={() => void saveTemporaryRestriction()}>Apply temporary restriction</Button>{selected.temporary_restriction?.active && <Button type="button" variant="ghost" size="compact" disabled={busy} onClick={() => void clearTemporaryRestriction()}>Clear temporary restriction</Button>}</div>{selected.temporary_restriction?.active && <p className="mt-2 text-xs text-muted-foreground">Active{selected.temporary_restriction.expires_at ? ` until ${new Date(selected.temporary_restriction.expires_at).toLocaleString()}` : " forever"}</p>}</div>}
                    <div className="mt-3 border-t border-border pt-3">
                      {selected.can_promote && <Button type="button" variant="ghost" size="compact" disabled={busy} onClick={() => { setView("admins"); beginPromotion(selected); }}>Promote to administrator</Button>}
                      {selected.can_remove && <Button type="button" variant="ghost" size="compact" className="text-destructive" disabled={busy} onClick={() => setConfirmation({ type: "remove", member: selected })}>Remove member</Button>}
                    </div>
                  </section>
                )}
              </GroupManagementSubpage>
            )}
            {view === "permissions" && (
              <GroupManagementSubpage data-testid="group-permissions-subpage">
                <p className="text-sm text-muted-foreground">
                  Changes affect ordinary members immediately for future
                  actions.
                </p>
                <section className="overflow-hidden rounded-lg border border-border bg-background divide-y divide-border" aria-label="Default member permissions">
                  {MEMBER_PERMISSION_KEYS.map((right) => {
                    const controlId = `${titleId}-default-${right}`;
                    return <GroupManagementControlRow key={right} label={groupPermissionLabel(right)} htmlFor={controlId} disabled={busy || !state.can_edit_defaults} control={<GroupManagementBooleanControl id={controlId} disabled={busy || !state.can_edit_defaults} checked={defaults.includes(right)} onChange={() => setDefaults(toggle(defaults, right))} />} />;
                  })}
                </section>
                <GroupManagementControlRow
                  label="Slow mode"
                  control={<select className="vt-select !w-40 !py-1 text-sm" aria-label="Slow mode" value={slowMode} disabled={busy || !state.can_manage_slow_mode} onChange={(event) => setSlowMode(Number(event.target.value))}>
                    <option value={0}>Off</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={300}>5 minutes</option><option value={900}>15 minutes</option><option value={3600}>1 hour</option>
                  </select>}
                />
              </GroupManagementSubpage>
            )}
            {view === "access" && (
              <GroupManagementSubpage data-testid="group-access-subpage">
                {!access ? <p role="status">Loading access policy…</p> : <>
                  <section className="space-y-3 rounded-lg border border-border p-3" aria-label="Group access policy">
                    <label className="block text-sm">Group type<select className="vt-select mt-1 block w-full" disabled={!access.capabilities.manage_access || busy} value={access.visibility} onChange={(event) => setAccess({ ...access, visibility: event.target.value as "private" | "public" })}><option value="private">Private</option><option value="public">Public</option></select></label>
                    {access.visibility === "public" && <label className="block text-sm">Public username<TextInput value={access.public_username ?? ""} disabled={!access.capabilities.manage_access || busy} onChange={(event) => setAccess({ ...access, public_username: event.target.value.toLowerCase() })} placeholder="group_name" size="compact" /></label>}
                    <label className="block text-sm">History for new members<select className="vt-select mt-1 block w-full" disabled={!access.capabilities.manage_access || busy} value={access.history_policy} onChange={(event) => setAccess({ ...access, history_policy: event.target.value as "visible" | "hidden" })}><option value="visible">Visible — full history</option><option value="hidden">Hidden — most recent {access.recent_history_count} messages</option></select></label>
                    <GroupManagementControlRow label="Protect group content" htmlFor={`${titleId}-protect`} control={<GroupManagementBooleanControl id={`${titleId}-protect`} disabled={!access.capabilities.manage_access || busy} checked={access.content_protection_enabled} onChange={() => setAccess({ ...access, content_protection_enabled: !access.content_protection_enabled })} />} />
                    <p className="text-xs text-muted-foreground">Blocks Vetra forwarding, copying, and explicit downloads. It cannot prevent screenshots or modified clients.</p>
                    {access.capabilities.manage_access && <Button type="button" variant="primary" size="compact" disabled={busy || (access.visibility === "public" && !access.public_username)} onClick={() => void saveAccess()}>Save access policy</Button>}
                  </section>
                  {access.capabilities.manage_invites && <section className="space-y-3" aria-label="Invite links"><h3 className="text-sm font-semibold">Invite links</h3><Button type="button" variant="ghost" size="compact" disabled={busy} onClick={async () => { await roomsApi.primaryInvite(ref); await reloadAccess(); }}>Ensure primary link</Button>{invites.map((invite) => <div key={invite.id} className="rounded-lg border border-border p-3 text-sm"><div className="flex items-center justify-between gap-2"><span><Link className="mr-1 inline h-4 w-4" />{invite.internal_name || (invite.kind === "primary" ? "Primary link" : "Additional link")}</span><span>{invite.state}</span></div><code className="mt-1 block select-all break-all text-xs">{invite.token}</code><p className="mt-1 text-xs text-muted-foreground">Uses {invite.use_count}{invite.max_uses ? ` / ${invite.max_uses}` : ""}{invite.approval_required ? " · approval required" : ""}</p>{invite.state === "active" && <div className="mt-2 flex gap-2"><Button type="button" size="compact" variant="ghost" onClick={() => void navigator.clipboard?.writeText(invite.token)}>Copy</Button>{invite.kind === "primary" ? <Button type="button" size="compact" variant="ghost" disabled={busy} onClick={async () => { await roomsApi.regenerateInvite(ref, invite.id); await reloadAccess(); }}>Regenerate</Button> : <Button type="button" size="compact" variant="ghost" disabled={busy} onClick={async () => { await roomsApi.revokeInvite(ref, invite.id); await reloadAccess(); }}>Revoke</Button>}</div>}</div>)}<div className="space-y-2 rounded-lg border border-border p-3"><TextInput value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Internal name (optional)" size="compact" /><label className="block text-xs">Expiry<input className="vt-input mt-1 block w-full" type="datetime-local" value={inviteExpiry} onChange={(e) => setInviteExpiry(e.target.value)} /></label><TextInput value={inviteLimit} onChange={(e) => setInviteLimit(e.target.value.replace(/\D/g, ""))} placeholder="Usage limit (optional)" size="compact" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inviteApproval} onChange={(e) => setInviteApproval(e.target.checked)} />Require administrator approval</label><Button type="button" variant="primary" size="compact" disabled={busy} onClick={() => void createInvite()}>Create additional link</Button></div></section>}
                  {access.capabilities.moderate_requests && <section className="space-y-2" aria-label="Pending join requests"><h3 className="text-sm font-semibold">Pending requests</h3>{requests.length === 0 ? <p className="text-sm text-muted-foreground">No pending requests.</p> : requests.map((request) => <div key={request.id} className="flex items-center justify-between rounded-lg border border-border p-3"><span>{request.user.display_name ?? request.user.username}</span><div className="flex gap-2"><Button type="button" size="compact" variant="primary" disabled={busy} onClick={async () => { await roomsApi.resolveJoinRequest(ref, request.id, "approve"); await reloadAccess(); }}>Approve</Button><Button type="button" size="compact" variant="ghost" disabled={busy} onClick={async () => { await roomsApi.resolveJoinRequest(ref, request.id, "reject"); await reloadAccess(); }}>Reject</Button></div></div>)}</section>}
                </>}
              </GroupManagementSubpage>
            )}
          </GroupManagementScrollBody>
        )}
        {state && view === "overview" && canChangeGroupInfo && <GroupManagementFooter data-testid="group-settings-footer">
          <span className="text-xs text-muted-foreground" role="status">{basicInfo.stage === "uploading" ? "Uploading photo…" : basicInfo.stage === "saving" ? "Saving…" : ""}</span>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" size="compact" className="!min-h-8 !rounded-md !border-0 !bg-transparent px-2 text-sm" disabled={basicInfo.saving} onClick={onClose}>Cancel</Button>
            <Button type="button" variant="ghost" size="compact" className="!min-h-8 !rounded-md !border-0 !bg-transparent px-2 text-sm text-primary" loading={basicInfo.saving} disabled={basicInfo.saveDisabled} onClick={() => void basicInfo.save()}>Save</Button>
          </div>
        </GroupManagementFooter>}
        {state && view === "permissions" && <GroupManagementFooter data-testid="group-permissions-footer">
          <Button type="button" variant="primary" size="compact" disabled={busy || !state.can_edit_defaults} onClick={() => void saveDefaults()}>Save defaults</Button>
        </GroupManagementFooter>}
      </div>
    </GroupManagementFrame>
    {basicInfo.cropSource && <AvatarCropDialog source={basicInfo.cropSource} onCancel={() => basicInfo.setCropSource(null)} onSetPhoto={basicInfo.replacePreview} />}
    {confirmationCopy && (
      <ConfirmModal
        title={confirmationCopy.title}
        message={confirmationCopy.message}
        confirmLabel={confirmationCopy.confirmLabel}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void confirmAction()}
        isLoading={busy}
        isDanger
      />
    )}
    </>
  );
}
