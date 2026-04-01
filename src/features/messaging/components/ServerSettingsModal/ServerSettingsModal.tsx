import { useState, useRef, useEffect } from "react";
import { useServerMembers } from "@/features/messaging/hooks/useServerMembers";
import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState, getState } from "@/store";
import { serversApi } from "@/api/servers";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import type { Server } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Avatar } from "@/shared/components/Avatar";
import { Plus, X } from "lucide-react";

interface Props {
  server:  Server;
  onClose: () => void;
}

type Tab = "members" | "danger";

export function ServerSettingsModal({ server, onClose }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);
  const setServers = useAppStore((s: RootState) => s.setServers);
  const [tab, setTab] = useState<Tab>("members");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);
  const [memberToKick, setMemberToKick] = useState<number | null>(null);
  const [isKicking, setIsKicking] = useState(false);

  const { query, setQuery, searchResults, isSearching, clearSearch } = useUserSearch();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    setIsDropdownOpen(!!query.trim());
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { members, isLoading, error, addMember, removeMember } = useServerMembers(server.id);
  const isOwner = currentUser?.id === server.created_by;

  async function handleAddMember(userId: number) {
    setSearchError(null);
    setIsDropdownOpen(false);
    try {
      if ((members || []).some((m) => m.user_id === userId)) {
        setSearchError("User already in server");
        return;
      }
      await addMember(userId);
      clearSearch();
    } catch (e) {
      setSearchError("Error adding member");
    }
  }

  async function handleLeaveServer() {
    if (!currentUser) return;
    setLeaving(true);
    try {
      await serversApi.removeMember(server.id, currentUser.id);
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
      await serversApi.delete(server.id);
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

  async function handleConfirmKick() {
    if (memberToKick === null) return;
    setIsKicking(true);
    try {
      await removeMember(memberToKick);
      setMemberToKick(null);
    } catch (e) {
      alert("Kick failed");
    } finally {
      setIsKicking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-muted-foreground">Settings</span>
            <h3 className="text-lg font-normal">{server.name}</h3>
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="flex px-4 border-b border-border gap-4">
          {(["members", "danger"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "py-3 text-sm border-b-2",
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              )}
            >
              {t === "members" ? "Members" : "Danger Zone"}
            </button>
          ))}
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {tab === "members" && (
            <div className="space-y-4">
              {isOwner && (
                <div className="relative flex flex-col gap-1" ref={dropdownRef}>
                  <label className="text-[10px] uppercase text-muted-foreground">Invite Member</label>
                  <input
                    className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
                    placeholder="Username..."
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
                  />
                  {isSearching && <div className="text-xs text-muted-foreground">Searching...</div>}
                  {isDropdownOpen && searchResults?.users?.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-[100] bg-popover border border-border mt-1 max-h-[200px] overflow-y-auto">
                      {searchResults.users.map((u) => (
                        <div key={u.id} onClick={() => handleAddMember(u.id)} className="p-2 cursor-pointer flex items-center gap-2 hover:bg-accent">
                          <Avatar name={u.display_name || u.username} size="small" />
                          <div className="flex-1 text-sm">{u.display_name || u.username}</div>
                          <Plus className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  )}
                  {searchError && <p className="text-destructive text-[10px]">{searchError}</p>}
                </div>
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
          )}

          {tab === "danger" && (
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
          )}
        </div>
      </div>

      {showConfirmDelete && (
        <ConfirmModal title="Delete Server" message="Are you sure?" confirmLabel="Delete" onConfirm={handleDeleteServer} onCancel={() => setShowConfirmDelete(false)} isLoading={deleting} isDanger />
      )}
      {showConfirmLeave && (
        <ConfirmModal title="Leave Server" message="Are you sure?" confirmLabel="Leave" onConfirm={handleLeaveServer} onCancel={() => setShowConfirmLeave(false)} isLoading={leaving} isDanger />
      )}
      {memberToKick !== null && (
        <ConfirmModal title="Kick Member" message="Remove user?" confirmLabel="Kick" onConfirm={handleConfirmKick} onCancel={() => setMemberToKick(null)} isLoading={isKicking} isDanger />
      )}
    </div>
  );
}
