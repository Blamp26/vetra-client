import { useEffect, useMemo, useState } from "react";
import {
  roomsApi,
  type GovernanceMember,
  type GroupGovernance,
} from "@/api/rooms";
import { roomRef } from "@/shared/utils/refs";
import type { RoomPreview } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";

const ADMIN_RIGHTS = [
  "change_group_info",
  "delete_messages",
  "remove_members",
  "invite_members",
  "pin_messages",
  "manage_member_permissions",
];
const MEMBER_RIGHTS = [
  "send_messages",
  "send_photos",
  "send_videos",
  "send_stickers_gifs",
  "send_music",
  "send_files",
  "send_voice_messages",
  "send_video_messages",
  "embed_links",
  "send_polls",
  "send_reactions",
];

export function GroupSettingsModal({
  room,
  onClose,
}: {
  room: RoomPreview;
  onClose: () => void;
}) {
  const [state, setState] = useState<GroupGovernance | null>(null);
  const [tab, setTab] = useState<"admins" | "members" | "permissions">(
    "admins",
  );
  const [selected, setSelected] = useState<GovernanceMember | null>(null);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [adminRights, setAdminRights] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [overrideDraft, setOverrideDraft] = useState<
    Record<string, "inherit" | "allow" | "deny">
  >({});
  const socketManager = useAppStore((s: RootState) => s.socketManager);
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const ref = roomRef(room) ?? room.id;
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
        MEMBER_RIGHTS.map((right) => [
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
        MEMBER_RIGHTS.filter((right) => overrideDraft[right] === "allow"),
        MEMBER_RIGHTS.filter((right) => overrideDraft[right] === "deny"),
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-label={`Manage ${room.name}`}
    >
      <div className="w-full max-w-lg rounded-lg bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{room.name} settings</h2>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {error && (
          <div role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!state ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              {(["admins", "members", "permissions"] as const).map((key) => (
                <button
                  key={key}
                  className={
                    tab === key
                      ? "font-semibold underline"
                      : "text-muted-foreground"
                  }
                  onClick={() => setTab(key)}
                >
                  {key === "admins"
                    ? "Administrators"
                    : key === "members"
                      ? "Members"
                      : "Member permissions"}
                </button>
              ))}
            </div>
            {tab === "admins" && (
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
                    {ADMIN_RIGHTS.map((right) => (
                      <label key={right} className="block text-sm">
                        <input
                          type="checkbox"
                          checked={adminRights.includes(right)}
                          onChange={() =>
                            setAdminRights(toggle(adminRights, right))
                          }
                        />{" "}
                        {right}
                      </label>
                    ))}
                    <button disabled={busy} onClick={() => void saveAdmin()}>
                      Save rights
                    </button>
                  </div>
                )}
              </div>
            )}
            {tab === "members" && (
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
                      {selected.effective_permissions?.join(", ") || "none"}
                    </p>
                    {MEMBER_RIGHTS.map((right) => (
                      <label
                        key={right}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{right}</span>
                        <select
                          aria-label={`${right} override`}
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
                            state.capabilities.includes(
                              "manage_member_permissions",
                            )
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
                            state.capabilities.includes(
                              "manage_member_permissions",
                            )
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
                            state.capabilities.includes("remove_members")
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
            {tab === "permissions" && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Changes affect ordinary members immediately for future
                  actions.
                </p>
                {MEMBER_RIGHTS.map((right) => (
                  <label key={right} className="block text-sm">
                    <input
                      type="checkbox"
                      checked={defaults.includes(right)}
                      onChange={() => setDefaults(toggle(defaults, right))}
                    />{" "}
                    {right}
                  </label>
                ))}
                <button disabled={busy} onClick={() => void saveDefaults()}>
                  Save defaults
                </button>
              </div>
            )}
          </>
        )}
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => {
              if (state?.role === "owner") {
                setError("owner_cannot_leave");
                return;
              }
              if (window.confirm("Leave this group?"))
                roomsApi
                  .leave(ref)
                  .then(onClose)
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : "Leave failed."),
                  );
            }}
          >
            Leave group
          </button>
        </div>
      </div>
    </div>
  );
}
