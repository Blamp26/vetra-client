import { useState, useRef, useEffect } from "react";
import { useServerMembers } from "@/features/messaging/hooks/useServerMembers";
import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState } from "@/store";
import { serversApi } from "@/api/servers";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import type { Server } from "@/shared/types";

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
      // Используем существующий метод removeMember, передавая текущего пользователя как target
      await serversApi.removeMember(server.id, currentUser.id);
      // Обновляем список серверов
      const updatedServers = await serversApi.getList();
      setServers(updatedServers);
      // Если текущий чат был связан с этим сервером, сбрасываем его
      const activeChat = useAppStore.getState().activeChat;
      if (
        activeChat?.type === "server" && activeChat.serverId === server.id ||
        activeChat?.type === "channel" && activeChat.serverId === server.id
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
      const activeChat = useAppStore.getState().activeChat;
      if (
        activeChat?.type === "server" && activeChat.serverId === server.id ||
        activeChat?.type === "channel" && activeChat.serverId === server.id
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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 480, maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>⚙️ {server.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {(["members", "danger"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "10px 0", background: "none", border: "none",
                borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                color: tab === t ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 600,
                transition: "color 0.15s",
              }}
            >
              {t === "members" ? "Участники" : "Danger Zone"}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: "auto" }}>
          {tab === "members" && (
            <>
              {isOwner && (
                <div style={{ marginBottom: 16, position: "relative" }} ref={dropdownRef}>
                  <label className="modal-label">Добавить участника</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="modal-input"
                      style={{ flex: 1 }}
                      placeholder="Поиск по никнейму..."
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
                      onFocus={() => query.trim() && setIsDropdownOpen(true)}
                    />
                    {isSearching && (
                      <div style={{ alignSelf: "center", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        ...
                      </div>
                    )}
                  </div>

                  {isDropdownOpen && (searchResults || []).length > 0 && (
                    <div
                      className="search-results-dropdown"
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        marginTop: 4,
                        maxHeight: 200,
                        overflowY: "auto",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                      }}
                    >
                      {(searchResults || []).map((user) => (
                        <div
                          key={user.id}
                          onClick={() => handleAddMember(user.id)}
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          <span className="avatar" style={{ width: 24, height: 24, fontSize: "0.75rem" }}>
                            {(user.display_name || user.username || "?")[0]?.toUpperCase() || "?"}
                          </span>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                              {user.display_name || user.username}
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              @{user.username}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchError && (
                    <p style={{ color: "var(--error)", fontSize: "0.82rem", marginTop: 4 }}>
                      {searchError}
                    </p>
                  )}
                </div>
              )}

              {isLoading && (
                <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Загрузка...</p>
              )}
              {error && (
                <p style={{ color: "var(--error)" }}>{error}</p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(members || []).map((m) => (
                  <div
                    key={m.user_id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                      borderRadius: "var(--radius)", background: "var(--bg-tertiary)",
                    }}
                  >
                    {m.avatar_url ? (
                      <img
                        src={m.avatar_url}
                        alt="avatar"
                        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <span
                          className="avatar"
                          style={{ width: 32, height: 32, fontSize: "0.85rem", flexShrink: 0 }}
                        >
                          {(m.display_name || m.username || "?")[0]?.toUpperCase() || "?"}
                        </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 500, fontSize: "0.9rem", display: "block" }}>
                        {m.display_name || m.username}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        @{m.username}
                      </span>
                    </div>
                    {m.is_owner && (
                      <span style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 600 }}>
                        Владелец
                      </span>
                    )}
                    {isOwner && !m.is_owner && currentUser?.id !== m.user_id && (
                      <button
                        className="btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "0.78rem", color: "var(--error)" }}
                        onClick={() => setMemberToKick(m.user_id)}
                      >
                        Исключить
                      </button>
                    )}
                  </div>
                ))}
                {!isLoading && (members || []).length === 0 && (
                  <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                    Нет участников
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "danger" && (
            <div style={{ padding: "8px 0" }}>
              {isOwner ? (
                <div
                  style={{
                    border: "1px solid var(--error)", borderRadius: "var(--radius)",
                    padding: 16,
                  }}
                >
                  <h4 style={{ color: "var(--error)", marginBottom: 8 }}>Удалить сервер</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: 12 }}>
                    Это действие необратимо. Все каналы и сообщения будут удалены.
                  </p>
                  {deleteError && (
                    <p style={{ color: "var(--error)", fontSize: "0.82rem", marginBottom: 8 }}>
                      {deleteError}
                    </p>
                  )}
                  <button
                    className="btn-primary"
                    style={{ background: "var(--error)", borderColor: "var(--error)" }}
                    onClick={() => setShowConfirmDelete(true)}
                    disabled={deleting}
                  >
                    {deleting ? "Удаление..." : "Удалить сервер"}
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid var(--border)", borderRadius: "var(--radius)",
                    padding: 16,
                  }}
                >
                  <h4 style={{ marginBottom: 8 }}>Покинуть сервер</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: 12 }}>
                    Вы покинете сервер, но сможете снова присоединиться по инвайту.
                  </p>
                  {deleteError && (
                    <p style={{ color: "var(--error)", fontSize: "0.82rem", marginBottom: 8 }}>
                      {deleteError}
                    </p>
                  )}
                  <button
                    className="btn-secondary"
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

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
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
