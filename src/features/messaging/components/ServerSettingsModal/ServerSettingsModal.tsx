import { useState, useRef, useEffect } from "react";
import { useServerMembers } from "@/features/messaging/hooks/useServerMembers";
import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState, getState } from "@/store";
import { serversApi } from "@/api/servers";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import type { Server } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Avatar } from "@/shared/components/Avatar";
import { Plus } from "lucide-react";

interface Props {
  server:  Server;
  onClose: () => void;
}

type Tab = "members" | "danger";

export function ServerSettingsModal({ server, onClose }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);
  const setServers = useAppStore((s: RootState) => s.setServers);
  const [tab,         setTab]       = useState<Tab>("members");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [leaving,     setLeaving]    = useState(false);
  const [deleting,    setDeleting]   = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);
  const [memberToKick, setMemberToKick] = useState<number | null>(null);
  const [isKicking, setIsKicking] = useState(false);

  const { query, setQuery, searchResults, isSearching, clearSearch } = useUserSearch();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (query.trim()) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
    }
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { members, isLoading, error, addMember, removeMember } =
    useServerMembers(server.id);

  const isOwner = currentUser?.id === server.created_by;

  async function handleAddMember(userId: number) {
    setSearchError(null);
    setIsDropdownOpen(false);
    try {
      if ((members || []).some((m) => m.user_id === userId)) {
        setSearchError("User is already in the server");
        return;
      }
      await addMember(userId);
      clearSearch();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleLeaveServer() {
    if (!currentUser) return;
    setLeaving(true);
    setDeleteError(null);
    try {
      await serversApi.removeMember(server.id, currentUser.id);
      const updatedServers = await serversApi.getList();
      setServers(updatedServers);
      const activeChat = getState().activeChat;
      if (
        (activeChat?.type === "server" && activeChat.serverId === server.id) ||
        (activeChat?.type === "channel" && activeChat.serverId === server.id)
      ) {
        setActiveChat(null);
      }
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to leave server");
    } finally {
      setLeaving(false);
    }
  }

  async function handleDeleteServer() {
    if (!currentUser) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await serversApi.delete(server.id);
      const updatedServers = await serversApi.getList();
      setServers(updatedServers);
      const activeChat = getState().activeChat;
      if (
        (activeChat?.type === "server" && activeChat.serverId === server.id) ||
        (activeChat?.type === "channel" && activeChat.serverId === server.id)
      ) {
        setActiveChat(null);
      }
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete server");
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
      console.error("Failed to kick member:", e);
      alert("Failed to kick member");
    } finally {
      setIsKicking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/40 backdrop-blur-3xl p-4 animate-in fade-in duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" onClick={onClose}>
      <div
        className="bg-card/60 backdrop-blur-2xl border border-white/10 dark:border-white/5 rounded-[2.5rem] shadow-[0_48px_96px_-24px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/10 w-full max-w-[520px] max-h-[85vh] flex flex-col animate-in zoom-in-[0.95] slide-in-from-bottom-8 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[0.625rem] font-bold text-primary uppercase tracking-[0.14em] mb-1">Server Settings</span>
            <h3 className="m-0 text-[1.25rem] font-extrabold text-foreground tracking-tight leading-tight">{server.name}</h3>
          </div>
          <button 
            className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground rounded-xl transition-all duration-300 active:scale-90" 
            onClick={onClose} 
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex px-8 border-b border-white/5 shrink-0 gap-6">
          {(["members", "danger"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "py-4 bg-transparent border-none cursor-pointer font-bold text-[0.875rem] transition-all duration-300 border-b-2 relative active:scale-95",
                tab === t 
                  ? "border-primary text-foreground" 
                  : "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
              )}
            >
              {t === "members" ? "Members" : "Danger Zone"}
              {tab === t && (
                <div className="absolute -bottom-[2px] left-0 right-0 h-[2px] bg-primary blur-[2px] opacity-50" />
              )}
            </button>
          ))}
        </div>

        <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
          {tab === "members" && (
            <div className="space-y-6">
              {isOwner && (
                <div className="relative space-y-3" ref={dropdownRef}>
                  <label className="block text-[0.625rem] font-bold uppercase tracking-[0.14em] text-primary">Invite Member</label>
                  <div className="relative group">
                    <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
                    <input
                      className="w-full px-5 py-4 bg-white/5 border border-white/10 dark:border-white/5 rounded-2xl text-foreground text-[0.9375rem] outline-none focus:bg-white/[0.08] focus:border-primary/50 transition-all duration-300 shadow-inner"
                      placeholder="Search by username..."
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
                      onFocus={() => query.trim() && setIsDropdownOpen(true)}
                    />
                    {isSearching && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                         <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  {isDropdownOpen && searchResults?.users && searchResults.users.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 z-[100] bg-card/90 backdrop-blur-3xl border border-white/10 rounded-2xl mt-2 max-h-[240px] overflow-y-auto shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-top-2 duration-300"
                    >
                      {searchResults.users.map((user) => (
                        <div
                          key={user.id}
                          onClick={() => handleAddMember(user.id)}
                          className="px-4 py-3 cursor-pointer flex items-center gap-4 transition-all duration-200 hover:bg-white/10 group"
                        >
                          <Avatar name={user.display_name || user.username} size="small" />
                          <div className="flex flex-col flex-1">
                            <span className="text-[0.9375rem] font-bold text-foreground group-hover:text-primary transition-colors">
                              {user.display_name || user.username}
                            </span>
                            <span className="text-[0.75rem] font-medium text-muted-foreground/60">
                              @{user.username}
                            </span>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="w-4 h-4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchError && (
                    <p className="text-destructive text-[0.8125rem] font-bold mt-2 ml-2 flex items-center gap-2">
                       <span className="w-1 h-1 rounded-full bg-destructive" />
                      {searchError}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                 <label className="block text-[0.625rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">Server Members</label>
                 
                 {isLoading && (
                   <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-50">
                      <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <span className="text-[0.875rem] font-bold tracking-tight">Syncing members...</span>
                   </div>
                 )}
                 
                 {error && (
                   <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl text-destructive text-sm font-bold">
                     {error}
                   </div>
                 )}

                 <div className="grid gap-2">
                   {(members || []).map((m) => (
                     <div
                       key={m.user_id}
                       className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/[0.08] transition-all duration-300 group"
                     >
                       <Avatar name={m.display_name || m.username} src={m.avatar_url} size="medium" />
                       <div className="flex-1 min-w-0">
                         <span className="font-extrabold text-[0.9375rem] block text-foreground truncate tracking-tight">
                           {m.display_name || m.username}
                         </span>
                         <span className="text-[0.75rem] font-bold text-muted-foreground/40 uppercase tracking-widest">
                           @{m.username}
                         </span>
                       </div>
                       {m.is_owner && (
                         <span className="text-[0.625rem] font-black bg-primary/20 text-primary px-2 py-1 rounded-md uppercase tracking-widest">
                           Owner
                         </span>
                       )}
                       {isOwner && !m.is_owner && currentUser?.id !== m.user_id && (
                         <button
                           className="px-4 py-2 bg-destructive/10 text-destructive text-[0.75rem] font-bold rounded-xl invisible group-hover:visible hover:bg-destructive hover:text-white transition-all duration-200 active:scale-90"
                           onClick={() => setMemberToKick(m.user_id)}
                         >
                           Kick
                         </button>
                       )}
                     </div>
                   ))}
                   {!isLoading && (members || []).length === 0 && (
                     <div className="py-12 text-center space-y-2">
                        <p className="m-0 text-[1rem] font-bold text-muted-foreground/40">No members found</p>
                     </div>
                   )}
                 </div>
              </div>
            </div>
          )}

          {tab === "danger" && (
            <div className="space-y-4">
               <label className="block text-[0.625rem] font-bold uppercase tracking-[0.14em] text-destructive">Destructive Actions</label>
              {isOwner ? (
                <div
                  className="border border-destructive/20 rounded-[2rem] p-8 bg-destructive/5 space-y-4 shadow-inner"
                >
                  <div className="space-y-1">
                    <h4 className="text-destructive text-[1.125rem] font-extrabold tracking-tight m-0">Delete Server</h4>
                    <p className="text-muted-foreground/60 text-[0.875rem] font-medium leading-relaxed m-0">
                      This action is irreversible. All channels, messages, and files will be permanently deleted.
                    </p>
                  </div>
                  {deleteError && (
                    <div className="p-3 bg-destructive/20 border border-destructive/20 rounded-xl text-destructive text-xs font-bold">
                      {deleteError}
                    </div>
                  )}
                  <button
                    className="px-6 py-3 bg-destructive text-white border-none rounded-2xl font-bold text-[0.875rem] transition-all duration-300 active:scale-95 hover:bg-destructive/90 hover:scale-105 shadow-lg shadow-destructive/20 disabled:opacity-50"
                    onClick={() => setShowConfirmDelete(true)}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting..." : "Delete Server"}
                  </button>
                </div>
              ) : (
                <div
                  className="border border-white/10 rounded-[2rem] p-8 bg-white/5 space-y-4 shadow-inner"
                >
                   <div className="space-y-1">
                    <h4 className="font-extrabold text-[1.125rem] tracking-tight m-0 text-foreground">Leave Server</h4>
                    <p className="text-muted-foreground/60 text-[0.875rem] font-medium leading-relaxed m-0">
                      You will lose access to all channels. You will need a new invite to rejoin.
                    </p>
                  </div>
                  {deleteError && (
                    <div className="p-3 bg-destructive/20 border border-destructive/20 rounded-xl text-destructive text-xs font-bold">
                      {deleteError}
                    </div>
                  )}
                  <button
                    className="px-6 py-3 bg-white/10 border border-white/10 rounded-2xl text-foreground font-bold text-[0.875rem] transition-all duration-300 hover:bg-white/20 active:scale-95 disabled:opacity-50"
                    onClick={() => setShowConfirmLeave(true)}
                    disabled={leaving}
                  >
                    {leaving ? "Leaving..." : "Leave Server"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-8 py-6 border-t border-white/5 flex justify-end bg-white/[0.02]">
          <button className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-muted-foreground text-[0.875rem] font-bold transition-all hover:bg-white/10 hover:text-foreground active:scale-95 cursor-pointer shadow-sm" onClick={onClose}>Close</button>
        </div>
      </div>

      {showConfirmDelete && (
        <ConfirmModal
          title="Delete Server"
          message={`Are you sure you want to delete "${server.name}"? This action is permanent and will destroy everything.`}
          confirmLabel="Delete Everything"
          onConfirm={handleDeleteServer}
          onCancel={() => setShowConfirmDelete(false)}
          isLoading={deleting}
          isDanger
        />
      )}

      {showConfirmLeave && (
        <ConfirmModal
          title="Leave Server"
          message={`Are you sure you want to leave "${server.name}"?`}
          confirmLabel="Leave"
          onConfirm={handleLeaveServer}
          onCancel={() => setShowConfirmLeave(false)}
          isLoading={leaving}
          isDanger
        />
      )}

      {memberToKick !== null && (
        <ConfirmModal
          title="Kick Member"
          message={`Remove this user from the server?`}
          confirmLabel="Kick"
          onConfirm={handleConfirmKick}
          onCancel={() => setMemberToKick(null)}
          isLoading={isKicking}
          isDanger
        />
      )}
    </div>
  );
}
