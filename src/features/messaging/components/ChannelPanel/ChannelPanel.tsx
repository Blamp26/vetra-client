import { useEffect, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { serversApi } from "@/api/servers";
import { roomsApi } from "@/api/rooms";
import { ServerSettingsModal } from "../ServerSettingsModal/ServerSettingsModal";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import type { Channel } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Settings, Trash2, Plus } from "lucide-react";

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

  const [showCreate,      setShowCreate]      = useState(false);
  const [showSettings,    setShowSettings]    = useState(false);
  const [newChannelName,  setNewChannelName]  = useState("");
  const [isCreating,      setIsCreating]      = useState(false);
  const [createError,     setCreateError]     = useState<string | null>(null);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const [isDeleting,      setIsDeleting]      = useState(false);

  const server    = servers[serverId];
  const isOwner   = currentUser?.id === server?.created_by;
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
      alert("Failed to delete channel");
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
      <div className="w-[320px] bg-background border-r border-border flex-shrink-0 flex flex-col overflow-hidden h-full">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-normal inline-flex items-center justify-center shrink-0 border border-border">
              {server?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="text-sm font-normal truncate text-foreground">
              {server?.name ?? "Server"}
            </span>
          </div>
          {server && (
            <button
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:bg-accent"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Section label + add button */}
        <div className="flex items-center justify-between p-4 pb-1">
          <span className="text-[10px] uppercase text-muted-foreground">Channels</span>
          <button
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-accent"
            onClick={() => { setShowCreate((v) => !v); setCreateError(null); setNewChannelName(""); }}
            title="Create"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Inline create form */}
        {showCreate && (
          <div className="p-4 border-b border-border flex-shrink-0">
            {createError && (
              <div className="bg-destructive/10 border border-destructive/20 p-2 text-destructive text-[10px] mb-2">
                {createError}
              </div>
            )}
            <input
              className="w-full px-2 py-1 bg-background border border-border text-sm outline-none focus:border-primary"
              type="text"
              placeholder="channel-name"
              value={newChannelName}
              autoFocus
              maxLength={100}
              onChange={(e) => { setNewChannelName(e.target.value); setCreateError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter")  handleCreateChannel();
                if (e.key === "Escape") { setShowCreate(false); setNewChannelName(""); }
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                className="flex-1 py-1 bg-primary text-primary-foreground text-xs border border-primary disabled:opacity-50"
                onClick={handleCreateChannel}
                disabled={isCreating || !newChannelName.trim()}
              >
                {isCreating ? "..." : "Create"}
              </button>
              <button
                className="flex-1 py-1 bg-background border border-border text-muted-foreground text-xs"
                onClick={() => { setShowCreate(false); setNewChannelName(""); }}
                disabled={isCreating}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading...</div>
          ) : !channels || channels.length === 0 ? (
            <div className="py-8 text-center px-4">
              <p className="text-xs text-muted-foreground">No channels.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {channels.map((ch) => {
                const hasUnread = (channelUnread[ch.id] ?? 0) > 0;

                return (
                  <div key={ch.id} className="relative group/channel">
                    <button
                      className={cn(
                        "flex items-center gap-2 w-full p-2 text-left text-sm border",
                        activeChannelId === ch.id
                          ? "bg-accent border-border text-foreground"
                          : "bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                      onClick={() => handleChannelClick(ch.id)}
                    >
                      <span className="text-muted-foreground opacity-50">#</span>
                      <span className="flex-1 truncate">{ch.name}</span>
                      {hasUnread && (
                        <div className="w-1.5 h-1.5 bg-primary shrink-0" />
                      )}
                    </button>

                    {isOwner && (
                      <button
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-destructive opacity-0 group-hover/channel:opacity-100 hover:bg-destructive hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChannelToDelete(ch);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
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
          title="Delete Channel"
          message={`Delete "#${channelToDelete.name}"?`}
          onConfirm={handleDeleteChannel}
          onCancel={() => setChannelToDelete(null)}
          isLoading={isDeleting}
          isDanger
        />
      )}
    </>
  );
}