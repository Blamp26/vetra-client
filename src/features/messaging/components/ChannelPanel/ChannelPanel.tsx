import { useEffect, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { serversApi } from "@/api/servers";
import { roomsApi } from "@/api/rooms";
import { ServerSettingsModal } from "../ServerSettingsModal/ServerSettingsModal";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import type { Channel } from "@/shared/types";
import { cn } from "@/shared/utils/cn";

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
      <div className="w-[360px] min-w-[360px] flex-shrink-0 flex flex-col bg-sidebar border-r border-border overflow-hidden h-full">
        {/* Header */}
        <div className="p-[12px_14px] border-b border-border bg-card flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] text-white text-[0.85rem] font-bold inline-flex items-center justify-center flex-shrink-0">{server?.name?.[0]?.toUpperCase() ?? "?"}</span>
            <span className="text-[0.9rem] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{server?.name ?? "Server"}</span>
          </div>
          {server && (
            <button
              className="text-[1rem] bg-none border-none cursor-pointer p-1 px-2 text-[#4A4A4A]"
              onClick={() => setShowSettings(true)}
              title="Настройки сервера"
            >
              ⚙️
            </button>
          )}
        </div>

        {/* Section label + add button */}
        <div className="flex items-center justify-between p-[10px_14px_4px]">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7A7A7A]">Channels</span>
          <button
            className="bg-none border-none text-[#7A7A7A] cursor-pointer text-[1.1rem] leading-none px-0.5 rounded transition-colors duration-150 hover:text-[#0A0A0A]"
            onClick={() => { setShowCreate((v) => !v); setCreateError(null); setNewChannelName(""); }}
            title="Add channel"
          >
            +
          </button>
        </div>

        {/* Inline create form */}
        {showCreate && (
          <div className="p-[4px_10px_10px] border-b border-[#E1E1E1] flex-shrink-0">
            {createError && (
              <div className="bg-[#E74C3C]/12 border border-[#E74C3C] rounded-lg p-2 px-3 text-[#E74C3C] text-[0.8rem] mb-1.5">
                {createError}
              </div>
            )}
            <input
              className="w-full px-2.5 py-1.5 bg-white border border-[#E1E1E1] rounded-lg text-[#0A0A0A] text-[0.85rem] font-inherit outline-none focus:border-[#5865F2]"
              type="text"
              placeholder="new-channel"
              value={newChannelName}
              autoFocus
              maxLength={100}
              onChange={(e) => { setNewChannelName(e.target.value); setCreateError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter")  handleCreateChannel();
                if (e.key === "Escape") { setShowCreate(false); setNewChannelName(""); }
              }}
            />
            <div className="flex gap-1.5 mt-1.5">
              <button
                className="flex-1 px-4 py-1.5 bg-[#5865F2] text-white border-none rounded-lg text-[0.82rem] font-semibold font-inherit cursor-pointer transition-colors duration-150 hover:bg-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleCreateChannel}
                disabled={isCreating || !newChannelName.trim()}
              >
                {isCreating ? "Creating…" : "Create"}
              </button>
              <button
                className="flex-1 px-4 py-1.5 bg-white border border-[#E1E1E1] rounded-lg text-[#4A4A4A] text-[0.82rem] font-inherit cursor-pointer transition-colors duration-150 hover:bg-[#EDEDED]"
                onClick={() => { setShowCreate(false); setNewChannelName(""); }}
                disabled={isCreating}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto p-[4px_6px] [scrollbar-gutter:stable]">
          {isLoading ? (
            <p className="p-[12px_8px] text-[#7A7A7A] text-[0.82rem] text-center leading-[1.5]">Loading channels…</p>
          ) : !channels || channels.length === 0 ? (
            <p className="p-[12px_8px] text-[#7A7A7A] text-[0.82rem] text-center leading-[1.5]">
              No channels yet.{" "}
              <button className="bg-none border-none text-[#5865F2] cursor-pointer text-[0.82rem] p-0 hover:underline" onClick={() => setShowCreate(true)}>
                Create the first one
              </button>
            </p>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-[1px]">
              {channels.map((ch) => {
                const hasUnread = (channelUnread[ch.id] ?? 0) > 0;

                return (
                  <li key={ch.id} className="relative group">
                    <button
                      className={cn(
                        "flex items-center gap-1.5 w-full p-[6px_8px_6px_10px] mx-[2px] border-none rounded-md bg-none text-[#4A4A4A] cursor-pointer text-[0.88rem] font-inherit text-left transition-colors duration-120 relative hover:bg-[#EDEDED] hover:text-[#0A0A0A]",
                        activeChannelId === ch.id && "bg-[#EDEDED] text-[#0A0A0A] before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-3/5 before:min-h-[20px] before:rounded-[0_2px_2px_0] before:bg-[#0A0A0A]",
                        hasUnread && "text-[#0A0A0A] font-semibold"
                      )}
                      onClick={() => handleChannelClick(ch.id)}
                    >
                      {hasUnread && <span className="absolute left-[-6px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] bg-[#5865F2] rounded-full shadow-[0_0_4px_#5865F2,0_0_10px_#5865F2,0_0_16px_#5865F2] pointer-events-none z-[2]" />}
                      <span className="text-[#7A7A7A] text-[1rem] font-semibold flex-shrink-0">#</span>
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis">{ch.name}</span>
                    </button>
                    {isOwner && (
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-none border-none cursor-pointer text-[#7A7A7A] text-[0.8rem] p-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChannelToDelete(ch);
                        }}
                        title="Удалить канал"
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
      </div>

      {showSettings && server && (
        <ServerSettingsModal
          server={server}
          onClose={() => setShowSettings(false)}
        />
      )}

      {channelToDelete && (
        <ConfirmModal
          title={`Delete channel "#${channelToDelete.name}"?`}
          message="This action cannot be undone."
          onConfirm={handleDeleteChannel}
          onCancel={() => setChannelToDelete(null)}
          isLoading={isDeleting}
        />
      )}
    </>
  );
}
