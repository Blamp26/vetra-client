import { useEffect, useId, useRef, useState } from "react";
import { useServerMembers } from "@/features/messaging/hooks/useServerMembers";
import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState, getState } from "@/store";
import { serversApi } from "@/api/servers";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import {
  Combobox,
  ComboboxInput,
  ComboboxList,
  ComboboxOption,
} from "@/shared/components/Combobox";
import { Dialog } from "@/shared/components/Dialog";
import {
  Tab as TabsTab,
  TabList,
  TabPanel,
  Tabs,
} from "@/shared/components/Tabs";
import { Button } from "@/shared/components/Button";
import { IconButton } from "@/shared/components/IconButton";
import type { Server, ServerRole } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Avatar } from "@/shared/components/Avatar";
import { Plus, X, Trash2 } from "lucide-react";
import { serverRef, userRef } from "@/shared/utils/refs";

interface Props {
  server: Server;
  onClose: () => void;
}

type Tab = "roles" | "members" | "danger";

const EDITABLE_PERMISSIONS = [
  "manage_server",
  "manage_roles",
  "manage_channels",
  "manage_members",
  "view_channel",
  "send_messages",
  "send_files",
  "send_photos",
  "send_videos",
  "embed_links",
  "send_reactions",
  "manage_messages",
];

function RolesPanel({ server }: { server: Server }) {
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ServerRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      setError(null);
      setRoles(await serversApi.getRoles(serverRef(server) ?? server.id));
    } catch {
      setError("Could not load roles.");
    }
  };
  useEffect(() => {
    void load();
  }, [server.id]);
  const begin = (role: ServerRole) => {
    if (!role.can_manage) return;
    setSelected(role);
    setName(role.name);
    setPermissions(role.permissions);
  };
  const save = async () => {
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (selected)
        await serversApi.updateRole(
          serverRef(server) ?? server.id,
          selected.id,
          { name: name.trim(), permissions },
        );
      else
        await serversApi.createRole(serverRef(server) ?? server.id, {
          name: name.trim(),
          permissions,
        });
      setSelected(null);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Role change failed.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (role: ServerRole) => {
    if (!window.confirm(`Delete ${role.name}?`)) return;
    setBusy(true);
    try {
      await serversApi.deleteRole(serverRef(server) ?? server.id, role.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Role deletion failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <input
          aria-label="Role name"
          className="flex-1 border border-border bg-background px-2 py-2 text-sm"
          placeholder="New role"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <Button size="compact" onClick={save} disabled={busy || !name.trim()}>
          {selected ? "Save" : "Create"}
        </Button>
        {selected && (
          <Button
            size="compact"
            variant="secondary"
            onClick={() => {
              setSelected(null);
              setName("");
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      {selected && (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-xs font-medium">Permissions</legend>
          {EDITABLE_PERMISSIONS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={permissions.includes(key)}
                onChange={(e) =>
                  setPermissions((p) =>
                    e.target.checked ? [...p, key] : p.filter((v) => v !== key),
                  )
                }
              />
              {key.replace(/_/g, " ")}
            </label>
          ))}
        </fieldset>
      )}
      {!roles.length && (
        <div className="text-xs text-muted-foreground">No roles yet.</div>
      )}
      <div className="divide-y divide-border">
        {roles.map((role) => (
          <div key={role.id} className="flex items-center gap-2 py-2">
            <span className="w-8 text-xs text-muted-foreground">
              {role.position}
            </span>
            <span className="flex-1 text-sm">
              {role.name}
              {role.is_everyone && (
                <span className="ml-2 text-xs text-muted-foreground">
                  implicit
                </span>
              )}
              {role.system_key && (
                <span className="ml-2 text-xs text-muted-foreground">
                  protected
                </span>
              )}
            </span>
            {role.can_manage && !role.is_everyone && (
              <>
                <Button
                  size="compact"
                  variant="secondary"
                  onClick={() => begin(role)}
                >
                  Edit
                </Button>
                <IconButton
                  label={`Delete ${role.name}`}
                  size="compact"
                  onClick={() => void remove(role)}
                >
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface MembersPanelProps {
  server: Server;
  currentUser: { id: number } | null;
}

function MembersPanel({ server, currentUser }: MembersPanelProps) {
  const [searchError, setSearchError] = useState<string | null>(null);
  const [memberToKick, setMemberToKick] = useState<number | null>(null);
  const [isKicking, setIsKicking] = useState(false);
  const { query, setQuery, searchResults, isSearching, clearSearch } =
    useUserSearch();
  const { members, isLoading, error, addMember, removeMember, reload } =
    useServerMembers(server);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeMemberValue, setActiveMemberValue] = useState<
    string | undefined
  >();
  const memberInputId = useId();
  const searchErrorId = `${memberInputId}-error`;
  const isOwner = currentUser?.id === server.created_by;
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  useEffect(() => {
    if (typeof serversApi.getRoles !== "function") return;
    void serversApi
      .getRoles(serverRef(server) ?? server.id)
      .then(setRoles)
      .catch(() => setRoleError("Could not load roles."));
  }, [server.id]);
  async function toggleRole(
    member: number,
    role: ServerRole,
    assigned: boolean,
  ) {
    setRoleError(null);
    try {
      if (assigned)
        await serversApi.unassignRole(
          serverRef(server) ?? server.id,
          member,
          role.id,
        );
      else
        await serversApi.assignRole(
          serverRef(server) ?? server.id,
          member,
          role.id,
        );
      // The member list is the bounded authoritative view; refresh after commit.
      await reload();
    } catch (e) {
      setRoleError(e instanceof Error ? e.message : "Role assignment failed.");
    }
  }

  async function handleAddMember(userId: number | string) {
    setSearchError(null);
    setIsDropdownOpen(false);
    setActiveMemberValue(undefined);
    try {
      if (
        (members || []).some(
          (m) => m.user_id === userId || m.user_public_id === userId,
        )
      ) {
        setSearchError("User already in server");
        return;
      }
      await addMember(userId);
      clearSearch();
    } catch (e) {
      setSearchError("Error adding member");
    }
  }

  async function handleConfirmKick() {
    if (memberToKick === null) return;
    setIsKicking(true);
    try {
      const kickedMember = members.find(
        (member) => member.user_id === memberToKick,
      );
      await removeMember(kickedMember?.user_public_id ?? memberToKick);
      setMemberToKick(null);
    } catch (e) {
      alert("Kick failed");
    } finally {
      setIsKicking(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        {isOwner && (
          <Combobox
            open={isDropdownOpen}
            onOpenChange={setIsDropdownOpen}
            activeValue={activeMemberValue}
            onActiveValueChange={setActiveMemberValue}
            className="relative flex flex-col gap-1"
          >
            <label className="vt-label" htmlFor={memberInputId}>
              Invite Member
            </label>
            <ComboboxInput
              id={memberInputId}
              aria-describedby={searchError ? searchErrorId : undefined}
              className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
              placeholder="Username..."
              value={query}
              onFocus={() => {
                if (query.trim()) setIsDropdownOpen(true);
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchError(null);
                setActiveMemberValue(undefined);
                setIsDropdownOpen(Boolean(e.target.value.trim()));
              }}
            />
            {isSearching && (
              <div
                className="text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                Searching...
              </div>
            )}
            <ComboboxList
              aria-label="Member search results"
              className="absolute top-full left-0 right-0 z-[100] bg-popover border border-border mt-1 max-h-[200px] overflow-y-auto"
            >
              {searchResults.users.map((u) => (
                <ComboboxOption
                  key={u.id}
                  value={`user:${u.public_id ?? u.id}`}
                  onSelect={() => handleAddMember(u.public_id ?? u.id)}
                  className="p-2 cursor-pointer flex items-center gap-2 hover:bg-accent"
                >
                  <Avatar name={u.display_name || u.username} size="small" />
                  <div className="flex-1 text-sm">
                    {u.display_name || u.username}
                  </div>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </ComboboxOption>
              ))}
            </ComboboxList>
            {searchError && (
              <p id={searchErrorId} className="text-destructive text-[10px]">
                {searchError}
              </p>
            )}
          </Combobox>
        )}

        <div className="space-y-2">
          {roleError && (
            <div className="text-xs text-destructive" role="alert">
              {roleError}
            </div>
          )}
          {isLoading && (
            <div
              className="py-4 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Loading...
            </div>
          )}
          {error && (
            <div className="text-xs text-destructive" role="alert">
              {error}
            </div>
          )}
          <div className="flex flex-col divide-y divide-border">
            {(members || []).map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 py-3">
                <Avatar
                  name={m.display_name || m.username}
                  src={m.avatar_url}
                  size="medium"
                />
                <div className="flex-1 min-w-0 text-sm">
                  <div className="truncate">{m.display_name || m.username}</div>
                  <div className="text-[10px] text-muted-foreground">
                    @{m.username}
                  </div>
                </div>
                {m.is_owner && (
                  <span className="text-xs text-muted-foreground">Owner</span>
                )}
                <div className="flex max-w-[52%] flex-wrap justify-end gap-1">
                  {roles
                    .filter((r) => !r.is_everyone && r.can_assign)
                    .map((role) => {
                      const assigned = Boolean(
                        m.roles?.some((r) => r.id === role.id),
                      );
                      return (
                        <button
                          key={role.id}
                          type="button"
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px]",
                            assigned
                              ? "border-primary text-primary"
                              : "border-border text-muted-foreground",
                          )}
                          disabled={
                            m.is_owner ||
                            !currentUser ||
                            currentUser.id === m.user_id
                          }
                          onClick={() =>
                            void toggleRole(m.user_id, role, assigned)
                          }
                          aria-pressed={assigned}
                        >
                          {role.name}
                        </button>
                      );
                    })}
                </div>
                {isOwner && !m.is_owner && currentUser?.id !== m.user_id && (
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    aria-label={`Kick ${m.display_name || `@${m.username}`}`}
                    className="border-destructive/40 text-destructive hover:text-destructive"
                    onClick={() => setMemberToKick(m.user_id)}
                  >
                    Kick
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {memberToKick !== null && (
        <ConfirmModal
          title="Kick Member"
          message="Remove user?"
          confirmLabel="Kick"
          onConfirm={handleConfirmKick}
          onCancel={() => setMemberToKick(null)}
          isLoading={isKicking}
          isDanger
        />
      )}
    </>
  );
}

export function ServerSettingsModal({ server, onClose }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);
  const setServers = useAppStore((s: RootState) => s.setServers);
  const [tab, setTab] = useState<Tab>("members");
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);
  const isOwner = currentUser?.id === server.created_by;
  const titleId = useId();
  const membersTabRef = useRef<HTMLButtonElement>(null);

  async function handleLeaveServer() {
    if (!currentUser) return;
    setLeaving(true);
    try {
      await serversApi.removeMember(
        serverRef(server) ?? server.id,
        userRef(currentUser) ?? currentUser.id,
      );
      const updated = await serversApi.getList();
      setServers(updated);
      const active = getState().activeChat;
      if (
        active &&
        (active.type === "server" || active.type === "channel") &&
        active.serverId === server.id
      ) {
        setActiveChat(null);
      }
      onClose();
    } catch (e) {
      setDeleteError("Error leaving");
    } finally {
      setLeaving(false);
    }
  }

  async function handleDeleteServer() {
    if (!currentUser) return;
    setDeleting(true);
    try {
      await serversApi.delete(serverRef(server) ?? server.id);
      const updated = await serversApi.getList();
      setServers(updated);
      const active = getState().activeChat;
      if (
        active &&
        (active.type === "server" || active.type === "channel") &&
        active.serverId === server.id
      ) {
        setActiveChat(null);
      }
      onClose();
    } catch (e) {
      setDeleteError("Error deleting");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={membersTabRef as React.RefObject<HTMLElement>}
      backdropClassName="vt-dialog-backdrop--server-settings"
      className="bg-card border border-border w-full max-w-lg max-h-[85vh] flex flex-col rounded-none shadow-none overflow-hidden"
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 id={titleId} className="text-lg font-semibold">
          {server.name} settings
        </h3>
        <IconButton
          label="Close server settings"
          size="compact"
          onClick={onClose}
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </IconButton>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabList
          aria-label="Server settings sections"
          className="flex px-4 border-b border-border gap-4"
        >
          <TabsTab
            ref={membersTabRef}
            value="members"
            className={cn(
              "py-3 text-sm border-b-2",
              tab === "members"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            Members
          </TabsTab>
          {server.can_manage === true && (
            <TabsTab
              value="roles"
              className={cn(
                "py-3 text-sm border-b-2",
                tab === "roles"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              Roles
            </TabsTab>
          )}
          <TabsTab
            value="danger"
            className={cn(
              "py-3 text-sm border-b-2",
              tab === "danger"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            Danger Zone
          </TabsTab>
        </TabList>

        <div className="p-4 flex-1 overflow-y-auto">
          {server.can_manage === true && (
            <TabPanel value="roles">
              <RolesPanel server={server} />
            </TabPanel>
          )}
          <TabPanel value="members">
            <MembersPanel server={server} currentUser={currentUser} />
          </TabPanel>

          <TabPanel value="danger">
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-medium text-destructive">
                  {isOwner ? "Delete Server" : "Leave Server"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isOwner
                    ? "Permanent deletion of all data."
                    : "Lose access to all channels."}
                </p>
              </div>
              {deleteError && (
                <div className="text-xs text-destructive" role="alert">
                  {deleteError}
                </div>
              )}
              <Button
                type="button"
                variant="danger"
                loading={deleting || leaving}
                disabled={deleting || leaving}
                onClick={() =>
                  isOwner
                    ? setShowConfirmDelete(true)
                    : setShowConfirmLeave(true)
                }
              >
                {isOwner ? "Delete" : "Leave"}
              </Button>
            </div>
          </TabPanel>
        </div>
      </Tabs>
      {showConfirmDelete && (
        <ConfirmModal
          title="Delete Server"
          message="Are you sure?"
          confirmLabel="Delete"
          onConfirm={handleDeleteServer}
          onCancel={() => setShowConfirmDelete(false)}
          isLoading={deleting}
          isDanger
        />
      )}
      {showConfirmLeave && (
        <ConfirmModal
          title="Leave Server"
          message="Are you sure?"
          confirmLabel="Leave"
          onConfirm={handleLeaveServer}
          onCancel={() => setShowConfirmLeave(false)}
          isLoading={leaving}
          isDanger
        />
      )}
    </Dialog>
  );
}
