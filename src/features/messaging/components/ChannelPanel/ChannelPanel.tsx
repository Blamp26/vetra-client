import { useEffect, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { serversApi } from "@/api/servers";
import { roomsApi } from "@/api/rooms";
import { ServerSettingsModal } from "../ServerSettingsModal/ServerSettingsModal";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import type { Channel } from "@/shared/types";

interface Props {
  serverId: number;
}

export function ChannelPanel({ serverId }: Props) {
  const servers              = useAppStore((s: RootState) => s.servers);
  const serverChannels       = useAppStore((s: RootState) => s.serverChannels);
  const channelsLoading      = useAppStore((s: RootState) => s.channelsLoading);
  const setServerChannels    = useAppStore((s: RootState) => s.setServerChannels);
  const addServerChannel     = useAppStore((s: RootState) => s.addServerChannel);
  const setChannelsLoading   = useAppStore((s: RootState) => s.setChannelsLoading);
  const setActiveChat        = useAppStore((s: RootState) => s.setActiveChat);
  const activeChat           = useAppStore((s: RootState) => s.activeChat);
  const upsertRoomPreview    = useAppStore((s: RootState) => s.upsertRoomPreview);
  const socketManager        = useAppStore((s: RootState) => s.socketManager);
  const currentUser          = useAppStore((s: RootState) => s.currentUser);
  const channelUnread        = useAppStore((s: RootState) => s.channelUnread);
  const resetChannelUnread   = useAppStore((s: RootState) => s.resetChannelUnread);

  const [showCreate,     setShowCreate]     = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [isCreating,     setIsCreating]     = useState(false);
  const [createError,    setCreateError]    = useState<string | null>(null);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const server    = servers[serverId];
  const isOwner = currentUser?.id === server?.created_by;
  const channels  = serverChannels[serverId];
  const isLoading = channelsLoading[serverId] ?? false;

  useEffect(() => {
    if (channels !== undefined) return;

    setChannelsLoading(serverId, true);
    serversApi
      .getChannels(serverId)
      .then((fetched) => setServerChannels(serverId, fetched))
      .catch((err) => {
        console.error("Failed to load channels:", err);
        setServerChannels(serverId, []);
      })
      .finally(() => setChannelsLoading(serverId, false));
  }, [serverId, channels, setChannelsLoading, setServerChannels]);

  const handleChannelClick = async (channelId: number) => {
    resetChannelUnread(channelId);
    setActiveChat({ type: "channel", channelId, serverId });
    if (socketManager) {
      try { await socketManager.joinRoomChannel(channelId); } catch { /* non-critical */ }
    }
  };

  const handleCreateChannel = async () => {
    if (!currentUser) return;

    const trimmed = newChannelName.trim();
    if (!trimmed) { setCreateError("Channel name is required."); return; }
    if (trimmed.length > 100) { setCreateError("Max 100 characters."); return; }

    setIsCreating(true);
    setCreateError(null);

    try {
      const channel = await serversApi.createChannel(serverId, trimmed);

      addServerChannel(serverId, channel);

      upsertRoomPreview({
        id: channel.id,
        name: channel.name,
        created_by: channel.created_by,
        server_id: channel.server_id,
        inserted_at: channel.inserted_at,
        unread_count: 0,
        last_message_at: null,
        last_message: null,
      });

      if (socketManager) {
        try { await socketManager.joinRoomChannel(channel.id); } catch { /* non-critical */ }
      }

      setNewChannelName("");
      setShowCreate(false);
      setActiveChat({ type: "channel", channelId: channel.id, serverId });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create channel.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!currentUser || !channelToDelete) return;
    setIsDeleting(true);
    try {
      await roomsApi.delete(channelToDelete.id);
      // Мы не удаляем из стора вручную, так как ожидаем событие по сокету room_deleted.
      // Но если мы хотим мгновенной реакции, можем обновить стор.
      // useSocketEvents.ts уже обрабатывает room_deleted и вызывает removeRoom.
      // Однако, removeRoom удаляет из roomPreviews, но нам нужно также удалить из serverChannels.
      
      // Добавим ручное удаление для лучшего UX
      const setServerChannels = useAppStore.getState().setServerChannels;
      const updatedChannels = (serverChannels[serverId] || []).filter(ch => ch.id !== channelToDelete.id);
      setServerChannels(serverId, updatedChannels);
      
      if (activeChat?.type === "channel" && activeChat.channelId === channelToDelete.id) {
        setActiveChat(null);
      }
      setChannelToDelete(null);
    } catch (err) {
      console.error("Failed to delete channel:", err);
      alert("Не удалось удалить канал");
    } finally {
      setIsDeleting(false);
    }
  };

  const activeChannelId =
    activeChat?.type === "channel" && activeChat.serverId === serverId
      ? activeChat.channelId
      : null;

  return (
    <>
      <aside className="channel-panel">
        {/* Header */}
        <div className="channel-panel-header">
          <div className="channel-panel-server-name">
            <span className="server-icon">{server?.name?.[0]?.toUpperCase() ?? "?"}</span>
            <span className="server-name-text">{server?.name ?? "Server"}</span>
          </div>
          {server && (
            <button
              className="channel-settings-btn"
              onClick={() => setShowSettings(true)}
              title="Настройки сервера"
              style={{
                fontSize: "1rem", background: "none", border: "none",
                cursor: "pointer", padding: "4px 8px", color: "var(--text-secondary)",
              }}
            >
              ⚙️
            </button>
          )}
        </div>

        {/* Section label + add button */}
        <div className="channel-section-header">
          <span className="channel-section-label">Channels</span>
          <button
            className="channel-add-btn"
            onClick={() => { setShowCreate((v) => !v); setCreateError(null); setNewChannelName(""); }}
            title="Add channel"
          >
            +
          </button>
        </div>

        {/* Inline create form */}
        {showCreate && (
          <div className="channel-create-form">
            {createError && (
              <div className="error-banner" style={{ marginBottom: "6px", fontSize: "0.8rem" }}>
                {createError}
              </div>
            )}
            <input
              className="modal-input"
              type="text"
              placeholder="new-channel"
              value={newChannelName}
              autoFocus
              maxLength={100}
              style={{ fontSize: "0.85rem", padding: "7px 10px" }}
              onChange={(e) => { setNewChannelName(e.target.value); setCreateError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter")  handleCreateChannel();
                if (e.key === "Escape") { setShowCreate(false); setNewChannelName(""); }
              }}
            />
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              <button
                className="btn-primary"
                style={{ flex: 1, marginTop: 0, fontSize: "0.82rem", padding: "6px 0" }}
                onClick={handleCreateChannel}
                disabled={isCreating || !newChannelName.trim()}
              >
                {isCreating ? "Creating…" : "Create"}
              </button>
              <button
                className="btn-secondary"
                style={{ flex: 1, fontSize: "0.82rem", padding: "6px 0" }}
                onClick={() => { setShowCreate(false); setNewChannelName(""); }}
                disabled={isCreating}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div className="channel-list-wrapper">
          {isLoading ? (
            <p className="channel-empty">Loading channels…</p>
          ) : !channels || channels.length === 0 ? (
            <p className="channel-empty">
              No channels yet.{" "}
              <button className="link-btn" style={{ fontSize: "0.82rem" }} onClick={() => setShowCreate(true)}>
                Create the first one
              </button>
            </p>
          ) : (
            <ul className="channel-list">
              {channels.map((ch) => {
                const hasUnread = (channelUnread[ch.id] ?? 0) > 0;

                return (
                  <li key={ch.id} style={{ position: "relative" }}>
                    <button
                      className={`
                        channel-item
                        ${activeChannelId === ch.id ? "active" : ""}
                        ${hasUnread ? "has-unread" : ""}
                      `}
                      onClick={() => handleChannelClick(ch.id)}
                    >
                      {hasUnread && <span className="unread-dot" />}
                      <span className="channel-hash">#</span>
                      <span className="channel-name">{ch.name}</span>
                    </button>
                    {isOwner && (
                      <button
                        className="channel-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChannelToDelete(ch);
                        }}
                        title="Удалить канал"
                        style={{
                          position: "absolute",
                          right: "8px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          fontSize: "0.8rem",
                          padding: "4px",
                          opacity: 0,
                          transition: "opacity 0.2s",
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/*
          NOTE: The user panel (avatar / nickname / settings) has been intentionally
          removed from this component.

          Rationale: Sidebar.tsx already renders a canonical user panel
          (sidebarUserPanel) that is always present in the DOM — it is the single
          source of truth for user identity UI.  Rendering a second copy here
          created a duplicate element every time the user transitioned from a
          DM/group chat to a server view, causing visual clutter and unnecessary
          DOM overhead.

          The Sidebar's user panel remains visible in server mode (its avatar is
          shown in the collapsed 72 px strip).  No functionality is lost: settings,
          profile, logout, and create-server/room actions all live in the Sidebar
          panel and are accessible in every view.
        */}
      </aside>

      {showSettings && server && (
        <ServerSettingsModal server={server} onClose={() => setShowSettings(false)} />
      )}

      {channelToDelete && (
        <ConfirmModal
          title="Удалить канал"
          message={`Вы уверены, что хотите удалить канал #${channelToDelete.name}? Все сообщения в этом канале будут навсегда удалены.`}
          confirmLabel="Удалить"
          onConfirm={handleDeleteChannel}
          onCancel={() => setChannelToDelete(null)}
          isLoading={isDeleting}
          isDanger
        />
      )}
    </>
  );
}
