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
      <div className="w-[360px] min-w-[360px] bg-card/40 backdrop-blur-3xl border-r border-white/5 flex-shrink-0 flex flex-col overflow-hidden h-full">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-white/5 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="relative">
              <span className="w-10 h-10 rounded-[1rem] bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-sm font-black inline-flex items-center justify-center flex-shrink-0 shadow-lg ring-2 ring-white/10">
                {server?.name?.[0]?.toUpperCase() ?? "?"}
              </span>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-online border-4 border-card" />
            </div>
            <span className="text-[1.125rem] font-extrabold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis text-foreground">
              {server?.name ?? "Server"}
            </span>
          </div>
          {server && (
            <button
              className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground rounded-xl transition-all duration-300 active:scale-90"
              onClick={() => setShowSettings(true)}
              title="Server Settings"
            >
              <Settings className="h-4.5 w-4.5" />
            </button>
          )}
        </div>

        {/* Section label + add button */}
        <div className="flex items-center justify-between p-6 pb-2">
          <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em] text-muted-foreground/50">Channels</span>
          <button
            className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground rounded-lg transition-all duration-300 active:scale-90"
            onClick={() => { setShowCreate((v) => !v); setCreateError(null); setNewChannelName(""); }}
            title="Create Channel"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Inline create form */}
        {showCreate && (
          <div className="p-6 border-b border-white/5 flex-shrink-0 bg-white/5 animate-in slide-in-from-top-4 duration-300">
            {createError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-destructive text-[0.75rem] font-bold mb-3">
                {createError}
              </div>
            )}
            <input
              className="w-full px-4 py-3 bg-white/5 border border-white/10 dark:border-white/5 rounded-xl text-foreground text-[0.875rem] outline-none focus:bg-white/10 focus:border-primary/50 transition-all duration-300"
              type="text"
              placeholder="new-channel-name"
              value={newChannelName}
              autoFocus
              maxLength={100}
              onChange={(e) => { setNewChannelName(e.target.value); setCreateError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter")  handleCreateChannel();
                if (e.key === "Escape") { setShowCreate(false); setNewChannelName(""); }
              }}
            />
            <div className="flex gap-3 mt-3">
              <button
                className="flex-1 py-2.5 bg-primary text-primary-foreground border-none rounded-xl text-[0.875rem] font-bold transition-all duration-300 active:scale-95 hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50"
                onClick={handleCreateChannel}
                disabled={isCreating || !newChannelName.trim()}
              >
                {isCreating ? "Creating…" : "Create"}
              </button>
              <button
                className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-muted-foreground text-[0.875rem] font-bold transition-all duration-300 active:scale-95 hover:bg-white/10 shadow-sm"
                onClick={() => { setShowCreate(false); setNewChannelName(""); }}
                disabled={isCreating}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-50">
               <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
               <span className="text-[0.8125rem] font-bold">Loading...</span>
            </div>
          ) : !channels || channels.length === 0 ? (
            <div className="py-12 text-center px-4 space-y-3">
              <p className="m-0 text-[0.875rem] font-medium text-muted-foreground/40 leading-relaxed">
                No channels found in this server.
              </p>
              <button 
                className="text-primary font-bold text-[0.8125rem] hover:underline cursor-pointer bg-none border-none p-0" 
                onClick={() => setShowCreate(true)}
              >
                Create First Channel
              </button>
            </div>
          ) : (
            <ul className="list-none m-0 p-0 space-y-1">
              {channels.map((ch) => {
                const hasUnread = (channelUnread[ch.id] ?? 0) > 0;

                return (
                  <li key={ch.id} className="relative group/channel">
                    <button
                      className={cn(
                        "flex items-center gap-3 w-full p-3 rounded-xl border-none bg-transparent transition-all duration-300 relative group active:scale-[0.98]",
                        activeChannelId === ch.id 
                          ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/20" 
                          : "text-muted-foreground/60 hover:bg-white/5 hover:text-foreground",
                        hasUnread && "text-foreground font-black"
                      )}
                      onClick={() => handleChannelClick(ch.id)}
                    >
                      {activeChannelId === ch.id && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full blur-[1px] opacity-80" />
                      )}
                      
                      <span className={cn(
                        "text-[1.125rem] font-black transition-colors duration-300 select-none",
                        activeChannelId === ch.id ? "text-primary" : "text-muted-foreground/20"
                      )}>#</span>
                      
                      <span className="flex-1 text-left font-bold tracking-tight truncate">{ch.name}</span>

                      {hasUnread && (
                        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] shrink-0" />
                      )}
                    </button>
                    
                    {isOwner && (
                      <button
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-destructive/10 text-destructive border-none rounded-lg cursor-pointer opacity-0 transition-all duration-300 group-hover/channel:opacity-100 hover:bg-destructive hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChannelToDelete(ch);
                        }}
                        title="Delete Channel"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
          title={`Delete Channel`}
          message={`Are you sure you want to delete "#${channelToDelete.name}"? This action is permanent.`}
          onConfirm={handleDeleteChannel}
          onCancel={() => setChannelToDelete(null)}
          isLoading={isDeleting}
          isDanger
        />
      )}
    </>
  );
}
