import { useEffect, useMemo, useState } from "react";
import { serversApi } from "@/api/servers";
import type {
  Channel,
  ChannelAccess,
  Server,
  ServerMember,
  ServerRole,
} from "@/shared/types";
import { serverRef, roomRef } from "@/shared/utils/refs";
import { Dialog } from "@/shared/components/Dialog";
import { Button } from "@/shared/components/Button";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { X, Trash2 } from "lucide-react";

const CHANNEL_PERMISSIONS = [
  "view_channel",
  "send_messages",
  "send_files",
  "send_photos",
  "send_videos",
  "embed_links",
  "send_reactions",
  "manage_messages",
];
type Subject =
  | { kind: "everyone" }
  | { kind: "role"; id: number }
  | { kind: "member"; id: number };

interface Props {
  server: Server;
  channel: Channel;
  currentUserId?: number;
  onClose: () => void;
  onSelfRevoked?: () => void;
}

export function ChannelAccessEditor({
  server,
  channel,
  currentUserId,
  onClose,
  onSelfRevoked,
}: Props) {
  const [access, setAccess] = useState<ChannelAccess | null>(null);
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [subject, setSubject] = useState<Subject>({ kind: "everyone" });
  const [memberQuery, setMemberQuery] = useState("");
  const [allow, setAllow] = useState<string[]>([]);
  const [deny, setDeny] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextAccess, nextRoles, nextMembers] = await Promise.all([
        serversApi.getChannelAccess(
          serverRef(server) ?? server.id,
          roomRef(channel) ?? channel.id,
        ),
        serversApi.getRoles(serverRef(server) ?? server.id),
        serversApi.getMembers(serverRef(server) ?? server.id),
      ]);
      setAccess(nextAccess);
      setRoles(nextRoles);
      setMembers(nextMembers);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load channel access.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [server.id, channel.id]);

  const override = useMemo(
    () =>
      access?.overrides.find((item) =>
        subject.kind === "everyone"
          ? item.role_id != null &&
            roles.find((r) => r.id === item.role_id)?.is_everyone
          : subject.kind === "role"
            ? item.role_id === subject.id
            : item.member_user_id === subject.id,
      ),
    [access, roles, subject],
  );
  useEffect(() => {
    setAllow(override?.allow ?? []);
    setDeny(override?.deny ?? []);
  }, [override]);

  useEffect(() => {
    if (subject.kind !== "member") return;
    void serversApi
      .getChannelAccess(
        serverRef(server) ?? server.id,
        roomRef(channel) ?? channel.id,
        subject.id,
      )
      .then((next) =>
        setAccess((previous) =>
          previous
            ? { ...previous, selected_member: next.selected_member }
            : next,
        ),
      )
      .catch(() => undefined);
  }, [subject, server.id, channel.id]);

  const selectedRole =
    subject.kind === "role"
      ? roles.find((role) => role.id === subject.id)
      : null;
  const selectedMember =
    subject.kind === "member"
      ? members.find((member) => member.user_id === subject.id)
      : null;
  const filteredMembers = members
    .filter((member) =>
      `${member.display_name ?? ""} ${member.username}`
        .toLowerCase()
        .includes(memberQuery.toLowerCase()),
    )
    .slice(0, 25);
  const protectedProjection =
    override?.provenance === "stage_2b_legacy_projection";
  const subjectLabel =
    subject.kind === "everyone"
      ? "@everyone"
      : subject.kind === "role"
        ? (selectedRole?.name ?? "Role")
        : selectedMember?.display_name || selectedMember?.username || "Member";
  const effective = subject.kind === "member" ? access?.selected_member : null;

  const setState = (
    permission: string,
    value: "inherit" | "allow" | "deny",
  ) => {
    setAllow((previous) => previous.filter((item) => item !== permission));
    setDeny((previous) => previous.filter((item) => item !== permission));
    if (value === "allow") setAllow((previous) => [...previous, permission]);
    if (value === "deny") setDeny((previous) => [...previous, permission]);
  };
  const stateFor = (permission: string): "inherit" | "allow" | "deny" =>
    allow.includes(permission)
      ? "allow"
      : deny.includes(permission)
        ? "deny"
        : "inherit";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const serverId = serverRef(server) ?? server.id;
      const roomId = roomRef(channel) ?? channel.id;
      if (subject.kind === "everyone")
        await serversApi.updateEveryoneAccess(serverId, roomId, allow, deny);
      if (subject.kind === "role")
        await serversApi.updateRoleAccess(
          serverId,
          roomId,
          subject.id,
          allow,
          deny,
        );
      if (subject.kind === "member")
        await serversApi.updateMemberAccess(
          serverId,
          roomId,
          subject.id,
          allow,
          deny,
        );
      await load();
      if (
        subject.kind === "member" &&
        subject.id === currentUserId &&
        deny.includes("view_channel")
      )
        onSelfRevoked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permission change failed.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      const serverId = serverRef(server) ?? server.id;
      const roomId = roomRef(channel) ?? channel.id;
      if (subject.kind === "role")
        await serversApi.deleteRoleAccess(serverId, roomId, subject.id);
      if (subject.kind === "member")
        await serversApi.deleteMemberAccess(serverId, roomId, subject.id);
      if (subject.kind === "everyone")
        await serversApi.updateEveryoneAccess(serverId, roomId, [], []);
      setConfirmDelete(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Override removal failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="channel-access-title"
      className="w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 id="channel-access-title" className="text-lg">
          #{channel.name} access
        </h2>
        <IconButton
          label="Close channel access"
          size="compact"
          onClick={onClose}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            Loading channel access…
          </div>
        )}
        {error && (
          <div role="alert" className="text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-medium">Subject</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="compact"
                  variant={
                    subject.kind === "everyone" ? "primary" : "secondary"
                  }
                  onClick={() => setSubject({ kind: "everyone" })}
                >
                  @everyone
                </Button>
                {roles
                  .filter((role) => !role.is_everyone)
                  .map((role) => (
                    <Button
                      key={role.id}
                      size="compact"
                      variant={
                        subject.kind === "role" && subject.id === role.id
                          ? "primary"
                          : "secondary"
                      }
                      disabled={!role.can_manage}
                      onClick={() => setSubject({ kind: "role", id: role.id })}
                    >
                      {role.name}
                    </Button>
                  ))}
              </div>
              <TextInput
                aria-label="Search channel members"
                placeholder="Search members…"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
              />
              {memberQuery && (
                <div className="max-h-28 overflow-y-auto border border-border">
                  {filteredMembers.map((member) => (
                    <button
                      type="button"
                      key={member.user_id}
                      className="block w-full p-2 text-left text-xs hover:bg-accent"
                      onClick={() => {
                        setSubject({ kind: "member", id: member.user_id });
                        setMemberQuery("");
                      }}
                    >
                      {member.display_name || member.username}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded border border-border p-3">
              <div className="mb-2 text-sm font-medium">{subjectLabel}</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Inherited permissions remain unchanged until explicitly allowed
                or denied. Owner access is always retained.
              </p>
              {effective && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Effective access: {effective.effective.join(", ") || "none"}
                </p>
              )}
              {protectedProjection && (
                <div role="note" className="mb-3 text-xs text-muted-foreground">
                  This compatibility projection is protected and cannot be
                  edited manually.
                </div>
              )}
              {CHANNEL_PERMISSIONS.map((permission) => (
                <label
                  key={permission}
                  className="flex items-center justify-between gap-3 border-t border-border py-2 text-xs"
                >
                  <span>{permission.replace(/_/g, " ")}</span>
                  <select
                    aria-label={`${permission} access`}
                    value={stateFor(permission)}
                    disabled={protectedProjection || saving}
                    onChange={(event) =>
                      setState(
                        permission,
                        event.target.value as "inherit" | "allow" | "deny",
                      )
                    }
                  >
                    <option value="inherit">Inherit</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex justify-between border-t border-border p-4">
        <Button
          size="compact"
          variant="secondary"
          disabled={protectedProjection || saving || !override}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Remove override
        </Button>
        <Button
          size="compact"
          variant="primary"
          loading={saving}
          disabled={loading || saving || protectedProjection}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Remove override"
          message={`Remove explicit access for ${subjectLabel}?`}
          confirmLabel="Remove"
          isDanger
          isLoading={saving}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Dialog>
  );
}
