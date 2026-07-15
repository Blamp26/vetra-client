import { useId, useRef, useState } from "react";
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
import { Tab as TabsTab, TabList, TabPanel, Tabs } from "@/shared/components/Tabs";
import type { Server } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Avatar } from "@/shared/components/Avatar";
import { Plus, X } from "lucide-react";
import { serverRef, userRef } from "@/shared/utils/refs";

interface Props {
  server:  Server;
  onClose: () => void;
}

type Tab = "members" | "danger";

interface MembersPanelProps {
  server: Server;
  currentUser: { id: number } | null;
}

function MembersPanel({ server, currentUser }: MembersPanelProps) {
  const [searchError, setSearchError] = useState<string | null>(null);
  const [memberToKick, setMemberToKick] = useState<number | null>(null);
  const [isKicking, setIsKicking] = useState(false);
  const { query, setQuery, searchResults, isSearching, clearSearch } = useUserSearch();
  const { members, isLoading, error, addMember, removeMember } = useServerMembers(server);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeMemberValue, setActiveMemberValue] = useState<string | undefined>();
  const memberInputId = useId();
  const searchErrorId = `${memberInputId}-error`;
  const isOwner = currentUser?.id === server.created_by;

  async function handleAddMember(userId: number | string) {
    setSearchError(null);
    setIsDropdownOpen(false);
    setActiveMemberValue(undefined);
    try {
      if ((members || []).some((m) => m.user_id === userId || m.user_public_id === userId)) {
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
      const kickedMember = members.find((member) => member.user_id === memberToKick);
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
            <label className="text-[10px] uppercase text-muted-foreground" htmlFor={memberInputId}>Invite Member</label>
            <ComboboxInput
              id={memberInputId}
              aria-describedby={searchError ? searchErrorId : undefined}
              className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
              placeholder="Username..."
              value={query}
              onFocus={() => { if (query.trim()) setIsDropdownOpen(true); }}
              onChange={(e) => { setQuery(e.target.value); setSearchError(null); setActiveMemberValue(undefined); setIsDropdownOpen(Boolean(e.target.value.trim())); }}
            />
            {isSearching && <div className="text-xs text-muted-foreground" role="status" aria-live="polite">Searching...</div>}
            <ComboboxList aria-label="Member search results" className="absolute top-full left-0 right-0 z-[100] bg-popover border border-border mt-1 max-h-[200px] overflow-y-auto">
                {searchResults.users.map((u) => (
                  <ComboboxOption
                    key={u.id}
                    value={`user:${u.public_id ?? u.id}`}
                    onSelect={() => handleAddMember(u.public_id ?? u.id)}
                    className="p-2 cursor-pointer flex items-center gap-2 hover:bg-accent"
                  >
                    <Avatar name={u.display_name || u.username} size="small" />
                    <div className="flex-1 text-sm">{u.display_name || u.username}</div>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </ComboboxOption>
                ))}
            </ComboboxList>
            {searchError && <p id={searchErrorId} className="text-destructive text-[10px]">{searchError}</p>}
          </Combobox>
        )}

        <div className="space-y-2">
          <label className="text-[10px] uppercase text-muted-foreground">Server Members</label>
          {isLoading && <div className="text-xs text-muted-foreground py-4">Loading...</div>}
          {error && <div className="p-2 bg-destructive/10 border border-destructive text-destructive text-xs">{error}</div>}
          <div className="flex flex-col gap-1">
            {(members || []).map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 p-2 border border-border group">
                <Avatar name={m.display_name || m.username} src={m.avatar_url} size="medium" />
                <div className="flex-1 min-w-0 text-sm">
                  <div className="truncate">{m.display_name || m.username}</div>
                  <div className="text-[10px] text-muted-foreground">@{m.username}</div>
                </div>
                {m.is_owner && <span className="text-[10px] uppercase border border-primary px-1">Owner</span>}
                {isOwner && !m.is_owner && currentUser?.id !== m.user_id && (
                  <button className="px-2 py-1 text-xs border border-destructive text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-white" onClick={() => setMemberToKick(m.user_id)}>Kick</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {memberToKick !== null && (
        <ConfirmModal title="Kick Member" message="Remove user?" confirmLabel="Kick" onConfirm={handleConfirmKick} onCancel={() => setMemberToKick(null)} isLoading={isKicking} isDanger />
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
      await serversApi.removeMember(serverRef(server) ?? server.id, userRef(currentUser) ?? currentUser.id);
      const updated = await serversApi.getList();
      setServers(updated);
      const active = getState().activeChat;
      if (active && (active.type === "server" || active.type === "channel") && active.serverId === server.id) {
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
      if (active && (active.type === "server" || active.type === "channel") && active.serverId === server.id) {
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
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-muted-foreground">Settings</span>
            <h3 id={titleId} className="text-lg font-normal">{server.name}{" "}<span className="sr-only">settings</span></h3>
          </div>
          <button type="button" aria-label="Close server settings" onClick={onClose} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="flex min-h-0 flex-1 flex-col">
          <TabList aria-label="Server settings sections" className="flex px-4 border-b border-border gap-4">
            <TabsTab
              ref={membersTabRef}
              value="members"
              className={cn(
                "py-3 text-sm border-b-2",
                tab === "members" ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
              )}
            >
              Members
            </TabsTab>
            <TabsTab
              value="danger"
              className={cn(
                "py-3 text-sm border-b-2",
                tab === "danger" ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
              )}
            >
              Danger Zone
            </TabsTab>
          </TabList>

          <div className="p-4 flex-1 overflow-y-auto">
            <TabPanel value="members">
              <MembersPanel server={server} currentUser={currentUser} />
            </TabPanel>

            <TabPanel value="danger">
              <div className="space-y-4">
                <label className="text-[10px] uppercase text-destructive">Danger Zone</label>
                <div className="p-4 border border-destructive/20 bg-destructive/5 space-y-4">
                  <div className="text-sm">
                    <div className="font-normal text-destructive">{isOwner ? "Delete Server" : "Leave Server"}</div>
                    <p className="text-muted-foreground text-xs">{isOwner ? "Permanent deletion of all data." : "Lose access to all channels."}</p>
                  </div>
                  {deleteError && <div className="text-destructive text-xs">{deleteError}</div>}
                  <button
                    className="px-4 py-2 bg-destructive text-white border border-destructive text-sm disabled:opacity-50"
                    onClick={() => isOwner ? setShowConfirmDelete(true) : setShowConfirmLeave(true)}
                    disabled={deleting || leaving}
                  >
                    {deleting || leaving ? "..." : (isOwner ? "Delete" : "Leave")}
                  </button>
                </div>
              </div>
            </TabPanel>
          </div>
        </Tabs>
      {showConfirmDelete && (
        <ConfirmModal title="Delete Server" message="Are you sure?" confirmLabel="Delete" onConfirm={handleDeleteServer} onCancel={() => setShowConfirmDelete(false)} isLoading={deleting} isDanger />
      )}
      {showConfirmLeave && (
        <ConfirmModal title="Leave Server" message="Are you sure?" confirmLabel="Leave" onConfirm={handleLeaveServer} onCancel={() => setShowConfirmLeave(false)} isLoading={leaving} isDanger />
      )}
    </Dialog>
  );
}
