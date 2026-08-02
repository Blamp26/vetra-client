import { useEffect, useId, useMemo, useState } from "react";
import { ChevronRight, KeyRound, LogOut, Shield, Trash2, Users } from "lucide-react";
import {
  roomsApi,
  type GovernanceMember,
  type GroupGovernance,
} from "@/api/rooms";
import { roomRef } from "@/shared/utils/refs";
import type { RoomPreview } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";
import { Button } from "@/shared/components/Button";
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
  GroupManagementFrame,
  GroupManagementHeader,
  GroupManagementRow,
  GroupManagementScrollBody,
  GroupManagementSection,
} from "../GroupManagement/GroupManagementLayout";

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
  const [adminRights, setAdminRights] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [overrideDraft, setOverrideDraft] = useState<
    Record<string, "inherit" | "allow" | "deny">
  >({});
  const [view, setView] = useState<"overview" | "admins" | "members" | "permissions">("overview");
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
        setSelected((current) =>
          current
            ? (next.members.find((member) => member.id === current.id) ?? null)
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
      void reload();
    });
    return unsubscribe;
  }, [room.id, socketManager, currentUser?.id, onClose]);
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
  const ordinary = useMemo(
    () => state?.members.filter((m) => m.role === "member") ?? [],
    [state],
  );
  const beginMemberEdit = (member: GovernanceMember) => {
    setSelected(member);
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
      setError(
        e instanceof Error ? e.message : "Member restriction update failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const removeSelected = async () => {
    if (
      !selected ||
      selected.role !== "member" ||
      !window.confirm("Remove this member from the group?")
    )
      return;
    setBusy(true);
    try {
      await roomsApi.removeMember(ref, selected.id);
      setSelected(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Member removal failed.");
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
      setError(e instanceof Error ? e.message : "Could not clear override.");
    } finally {
      setBusy(false);
    }
  };
  const saveDefaults = async () => {
    setBusy(true);
    setError(null);
    try {
      await roomsApi.updateDefaults(ref, defaults);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permission update failed.");
    } finally {
      setBusy(false);
    }
  };
  const promote = async (m: GovernanceMember) => {
    setBusy(true);
    try {
      await roomsApi.promote(ref, m.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promotion failed.");
    } finally {
      setBusy(false);
    }
  };
  const saveAdmin = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await roomsApi.updateAdminRights(ref, selected.id, adminRights);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Administrator update failed.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  const canManagePermissions = state?.role === "owner" || state?.capabilities.includes("manage_member_permissions");
  const canRemoveMembers = state?.role === "owner" || state?.capabilities.includes("remove_members");
  const leaveGroup = () => {
    if (state?.role === "owner") {
      setError("owner_cannot_leave");
      return;
    }
    if (window.confirm("Leave this group?")) {
      void roomsApi.leave(ref).then(onClose).catch((e) => setError(e instanceof Error ? e.message : "Leave failed."));
    }
  };
  const deleteGroup = () => {
    if (state?.role !== "owner" || !window.confirm("Delete this group?")) return;
    setBusy(true);
    void roomsApi.delete(ref).then(onClose).catch((e) => setError(e instanceof Error ? e.message : "Delete failed.")).finally(() => setBusy(false));
  };
  return (
    <>
    <GroupManagementFrame width="settings" onClose={onClose} labelledBy={titleId}>
      <div className="contents" data-testid="group-management-dialog">
        <GroupManagementHeader
          title="Edit group"
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
                <GroupBasicInfoFields room={room} titleId={titleId} descriptionId={descriptionId} controller={basicInfo} />
                <GroupManagementSection separated className="p-0" aria-label="Group management navigation">
                <nav aria-label="Group management sections">
                  <GroupManagementRow label="Administrators" leading={<Shield className="h-4 w-4 text-muted-foreground" />} trailing={<><span>{admins.length}</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></>} onClick={() => setView("admins")} />
                  <GroupManagementRow label="Members" leading={<Users className="h-4 w-4 text-muted-foreground" />} trailing={<><span>{state.members.length}</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></>} onClick={() => setView("members")} />
                  <GroupManagementRow label="Member permissions" leading={<KeyRound className="h-4 w-4 text-muted-foreground" />} trailing={<ChevronRight className="h-4 w-4" aria-hidden="true" />} onClick={() => setView("permissions")} />
                </nav>
                </GroupManagementSection>
                <GroupManagementSection separated className="p-0" aria-label="Group actions">
                  <GroupManagementRow label="Leave group" leading={<LogOut className="h-4 w-4" />} onClick={leaveGroup} />
                  {state.role === "owner" && <GroupManagementRow label="Delete group" leading={<Trash2 className="h-4 w-4" />} tone="destructive" disabled={busy} onClick={deleteGroup} />}
                </GroupManagementSection>
              </>
            )}
            {view === "admins" && (
              <div className="space-y-3">
                <p className="text-sm">
                  Owner:{" "}
                  {state.members.find((m) => m.role === "owner")
                    ?.display_name ??
                    state.members.find((m) => m.role === "owner")?.username}
                </p>
                {admins.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="flex-1">
                      {m.display_name ?? m.username}
                    </span>
                    <button
                      disabled={state.role !== "owner" || busy}
                      onClick={() => {
                        setSelected(m);
                        setAdminRights(m.admin_permissions);
                      }}
                    >
                      Edit rights
                    </button>
                    <button
                      disabled={state.role !== "owner" || busy}
                      onClick={() =>
                        window.confirm("Demote this administrator?") &&
                        roomsApi
                          .demote(ref, m.id)
                          .then(reload)
                          .catch((e) => setError(e.message))
                      }
                    >
                      Demote
                    </button>
                  </div>
                ))}
                {ordinary.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="flex-1">
                      {m.display_name ?? m.username}
                    </span>
                    <button
                      disabled={state.role !== "owner" || busy}
                      onClick={() => void promote(m)}
                    >
                      Promote
                    </button>
                  </div>
                ))}
                {selected && (
                  <div className="rounded border p-3">
                    <h3 className="mb-2 font-medium">Administrator rights</h3>
                    {ADMIN_PERMISSION_KEYS.map((right) => (
                      <label key={right} className="block text-sm">
                        <input
                          type="checkbox"
                          checked={adminRights.includes(right)}
                          onChange={() =>
                            setAdminRights(toggle(adminRights, right))
                          }
                        />{" "}
                        {groupPermissionLabel(right)}
                      </label>
                    ))}
                    <button disabled={busy} onClick={() => void saveAdmin()}>
                      Save rights
                    </button>
                  </div>
                )}
              </div>
            )}
            {view === "members" && (
              <div className="space-y-2">
                <label className="block text-sm">
                  <span className="sr-only">Search members</span>
                  <input
                    value={memberQuery}
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder="Search members"
                  />
                </label>
                {ordinary.map((m) => (
                  <button
                    key={m.id}
                    className="block w-full rounded border p-2 text-left"
                    onClick={() => beginMemberEdit(m)}
                  >
                    {m.display_name ?? m.username}{" "}
                    <span className="text-xs text-muted-foreground">
                      {m.effective_permissions?.length ?? 0} effective
                      permissions
                    </span>
                  </button>
                ))}
                {selected?.role === "member" && (
                  <div className="rounded border p-3">
                    <p className="mb-2 text-sm">
                      Effective:{" "}
                      {selected.effective_permissions?.map(groupPermissionLabel).join(", ") || "none"}
                    </p>
                    {MEMBER_PERMISSION_KEYS.map((right) => (
                      <label
                        key={right}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{groupPermissionLabel(right)}</span>
                        <select
                          aria-label={`${groupPermissionLabel(right)} override`}
                          value={overrideDraft[right] ?? "inherit"}
                          onChange={(event) =>
                            setOverrideDraft((current) => ({
                              ...current,
                              [right]: event.target.value as
                                | "inherit"
                                | "allow"
                                | "deny",
                            }))
                          }
                        >
                          <option value="inherit">Inherit</option>
                          <option value="allow">Allow</option>
                          <option value="deny">Deny</option>
                        </select>
                      </label>
                    ))}
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={
                          busy ||
                          !(
                            state.role === "owner" ||
                            canManagePermissions
                          )
                        }
                        onClick={() => void saveOverride()}
                      >
                        Save restrictions
                      </button>
                      <button
                        disabled={
                          busy ||
                          !(
                            state.role === "owner" ||
                            canManagePermissions
                          )
                        }
                        onClick={() => void clearSelectedOverride()}
                      >
                        Clear override
                      </button>
                      <button
                        disabled={
                          busy ||
                          !(
                            state.role === "owner" ||
                            canRemoveMembers
                          )
                        }
                        onClick={() => void removeSelected()}
                      >
                        Remove member
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {view === "permissions" && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Changes affect ordinary members immediately for future
                  actions.
                </p>
                {MEMBER_PERMISSION_KEYS.map((right) => (
                  <label key={right} className="block text-sm">
                    <input
                      type="checkbox"
                      checked={defaults.includes(right)}
                      onChange={() => setDefaults(toggle(defaults, right))}
                    />{" "}
                    {groupPermissionLabel(right)}
                  </label>
                ))}
                <button disabled={busy} onClick={() => void saveDefaults()}>
                  Save defaults
                </button>
              </div>
            )}
          </GroupManagementScrollBody>
        )}
        {state && view === "overview" && <GroupManagementFooter data-testid="group-settings-footer">
          <span className="text-xs text-muted-foreground" role="status">{basicInfo.stage === "uploading" ? "Uploading photo…" : basicInfo.stage === "saving" ? "Saving…" : ""}</span>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" size="compact" className="!min-h-8 !rounded-md !border-0 !bg-transparent px-2 text-sm" disabled={basicInfo.saving} onClick={onClose}>Cancel</Button>
            <Button type="button" variant="ghost" size="compact" className="!min-h-8 !rounded-md !border-0 !bg-transparent px-2 text-sm text-primary" loading={basicInfo.saving} disabled={basicInfo.saveDisabled} onClick={() => void basicInfo.save()}>Save</Button>
          </div>
        </GroupManagementFooter>}
      </div>
    </GroupManagementFrame>
    {basicInfo.cropSource && <AvatarCropDialog source={basicInfo.cropSource} onCancel={() => basicInfo.setCropSource(null)} onSetPhoto={basicInfo.replacePreview} />}
    </>
  );
}
