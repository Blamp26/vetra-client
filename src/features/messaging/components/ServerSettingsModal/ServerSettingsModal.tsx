import { useState, useRef, useEffect } from "react";
import { useServerMembers } from "@/features/messaging/hooks/useServerMembers";
import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState, getState } from "@/store";
import { serversApi } from "@/api/servers";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import type { Server } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Avatar } from "@/shared/components/Avatar";

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
        setSearchError("Пользователь уже в сервере");
        return;
      }
      await addMember(userId);
      clearSearch();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Ошибка");
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
      setDeleteError(e instanceof Error ? e.message : "Не удалось покинуть сервер");
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
      setDeleteError(e instanceof Error ? e.message : "Не удалось удалить сервер");
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
      alert("Не удалось исключить участника");
    } finally {
      setIsKicking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-full max-w-[480px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="m-0 text-lg font-bold text-foreground">⚙️ {server.name}</h3>
          <button className="bg-transparent border-none text-2xl cursor-pointer text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="flex border-b border-border shrink-0">
          {(["members", "danger"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2.5 bg-transparent border-none cursor-pointer font-inherit text-sm font-semibold transition-colors duration-150 border-b-2",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "members" ? "Участники" : "Danger Zone"}
            </button>
          ))}
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {tab === "members" && (
            <>
              {isOwner && (
                <div className="mb-4 relative" ref={dropdownRef}>
                  <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Добавить участника</label>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm font-inherit outline-none focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Поиск по никнейму..."
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
                      onFocus={() => query.trim() && setIsDropdownOpen(true)}
                    />
                    {isSearching && (
                      <div className="self-center text-sm text-muted-foreground">
                        ...
                      </div>
                    )}
                  </div>

                  {isDropdownOpen && searchResults?.users && searchResults.users.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 z-[100] bg-popover border border-border rounded-lg mt-1 max-h-[200px] overflow-y-auto shadow-lg"
                    >
                      {searchResults.users.map((user) => (
                        <div
                          key={user.id}
                          onClick={() => handleAddMember(user.id)}
                          className="px-3 py-2 cursor-pointer flex items-center gap-2.5 transition-colors duration-100 hover:bg-accent"
                        >
                          <Avatar name={user.display_name || user.username} size="small" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {user.display_name || user.username}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              @{user.username}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchError && (
                    <p className="text-destructive text-sm mt-1">
                      {searchError}
                    </p>
                  )}
                </div>
              )}

              {isLoading && (
                <p className="text-muted-foreground text-center py-4 text-sm">Загрузка...</p>
              )}
              {error && (
                <p className="text-destructive py-2 text-sm">{error}</p>
              )}

              <div className="flex flex-col gap-1">
                {(members || []).map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-muted/30 border border-transparent"
                  >
                    <Avatar name={m.display_name || m.username} src={m.avatar_url} size="medium" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm block text-foreground truncate">
                        {m.display_name || m.username}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        @{m.username}
                      </span>
                    </div>
                    {m.is_owner && (
                      <span className="text-xs text-primary font-semibold">
                        Владелец
                      </span>
                    )}
                    {isOwner && !m.is_owner && currentUser?.id !== m.user_id && (
                      <button
                        className="px-2.5 py-1 bg-background border border-border rounded text-destructive text-xs cursor-pointer hover:bg-destructive/10 transition-colors duration-150"
                        onClick={() => setMemberToKick(m.user_id)}
                      >
                        Исключить
                      </button>
                    )}
                  </div>
                ))}
                {!isLoading && (members || []).length === 0 && (
                  <p className="text-muted-foreground text-center py-5 text-sm">
                    Нет участников
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "danger" && (
            <div className="py-2">
              {isOwner ? (
                <div
                  className="border border-destructive rounded-lg p-4 bg-destructive/5"
                >
                  <h4 className="text-destructive font-bold mb-2">Удалить сервер</h4>
                  <p className="text-muted-foreground text-sm mb-3 leading-relaxed">
                    Это действие необратимо. Все каналы и сообщения будут удалены.
                  </p>
                  {deleteError && (
                    <p className="text-destructive text-sm mb-2">
                      {deleteError}
                    </p>
                  )}
                  <button
                    className="px-4 py-2 bg-destructive text-destructive-foreground border-none rounded-lg font-bold cursor-pointer hover:bg-destructive/90 transition-colors duration-150 disabled:opacity-50"
                    onClick={() => setShowConfirmDelete(true)}
                    disabled={deleting}
                  >
                    {deleting ? "Удаление..." : "Удалить сервер"}
                  </button>
                </div>
              ) : (
                <div
                  className="border border-border rounded-lg p-4 bg-muted/30"
                >
                  <h4 className="font-bold mb-2 text-foreground">Покинуть сервер</h4>
                  <p className="text-muted-foreground text-sm mb-3 leading-relaxed">
                    Вы покинете сервер, но сможете снова присоединиться по инвайту.
                  </p>
                  {deleteError && (
                    <p className="text-destructive text-sm mb-2">
                      {deleteError}
                    </p>
                  )}
                  <button
                    className="px-4 py-2 bg-background border border-border rounded-lg text-muted-foreground cursor-pointer hover:bg-accent transition-colors duration-150 disabled:opacity-50"
                    onClick={() => setShowConfirmLeave(true)}
                    disabled={leaving}
                  >
                    {leaving ? "Выход..." : "Покинуть сервер"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end bg-muted/30">
          <button className="px-4 py-2 bg-background border border-border rounded-lg text-muted-foreground text-sm font-inherit cursor-pointer hover:bg-accent" onClick={onClose}>Закрыть</button>
        </div>
      </div>

      {showConfirmDelete && (
        <ConfirmModal
          title="Удалить сервер"
          message={`Вы уверены, что хотите удалить сервер "${server.name}"? Это действие необратимо, все каналы и сообщения будут удалены.`}
          confirmLabel="Удалить"
          onConfirm={handleDeleteServer}
          onCancel={() => setShowConfirmDelete(false)}
          isLoading={deleting}
          isDanger
        />
      )}

      {showConfirmLeave && (
        <ConfirmModal
          title="Покинуть сервер"
          message={`Вы уверены, что хотите покинуть сервер "${server.name}"?`}
          confirmLabel="Покинуть"
          onConfirm={handleLeaveServer}
          onCancel={() => setShowConfirmLeave(false)}
          isLoading={leaving}
          isDanger
        />
      )}

      {memberToKick !== null && (
        <ConfirmModal
          title="Исключить участника"
          message={`Вы уверены, что хотите исключить этого участника из сервера?`}
          confirmLabel="Исключить"
          onConfirm={handleConfirmKick}
          onCancel={() => setMemberToKick(null)}
          isLoading={isKicking}
          isDanger
        />
      )}
    </div>
  );
}
