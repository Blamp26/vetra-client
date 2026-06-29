import { useState, useRef, useEffect, useMemo } from "react";
import { useAppStore } from "@/store";
import { AuthPage } from "@/features/registration/AuthPage";
import { Sidebar } from "@/features/messaging/components/Sidebar";
import { SidebarFooter } from "@/features/messaging/components/Sidebar/SidebarFooter";
import { ChatWindow } from "@/features/messaging/components/ChatWindow/ChatWindow";
import { ChannelPanel } from "@/features/messaging/components/ChannelPanel/ChannelPanel";
import { SettingsPage } from "@/features/settings/components/SettingsPage/SettingsPage";
import { useSocketEvents } from "@/features/messaging/hooks/useSocketEvents";
import { useAuthHydration } from "@/shared/hooks/useAuthHydration";
import {
  activeChatKey,
  buildHashForActiveChat,
  resolveHashToActiveChat,
} from "@/shared/utils/chatRoutes";
import { useCall } from "./features/calling/hooks/useCall";

import { IncomingCallModal } from "./features/calling/components/IncomingCallModal";
import { ActiveCallWindow } from "./features/calling/components/ActiveCallWindow";
import { ToastHost } from "@/shared/components/ToastHost/ToastHost";

function EmptyState({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  mode: "channel" | "conversation";
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-2xl border border-border bg-card p-4">
        <div className="space-y-2">
          <span className="text-xs uppercase text-muted-foreground">
            {eyebrow}
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-normal text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const currentUser = useAppStore((s) => s.currentUser);
  const {
    status,
    remoteStream,
    remoteUsername,
    remoteUserId,
    isMuted,
    seconds,
    diagnostics,
    toggleMute,
    hangUp,
    acceptCall,
    rejectCall,
    startCall,
  } = useCall(currentUser?.id ?? 0);
  const activeChat = useAppStore((s) => s.activeChat);
  const conversationPreviews = useAppStore((s) => s.conversationPreviews);
  const roomPreviews = useAppStore((s) => s.roomPreviews);
  const servers = useAppStore((s) => s.servers);
  const serverChannels = useAppStore((s) => s.serverChannels);
  const searchResults = useAppStore((s) => s.searchResults);
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const openModal = useAppStore((s) => s.openModal);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [routeHash, setRouteHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash || "#" : "#",
  );
  const currentActiveChatKey = activeChatKey(activeChat);
  const currentActiveChatKeyRef = useRef(currentActiveChatKey);

  useEffect(() => {
    currentActiveChatKeyRef.current = currentActiveChatKey;
  }, [currentActiveChatKey]);

  useEffect(() => {
    const syncHashState = () => {
      const nextHash = window.location.hash || "#";
      setRouteHash((prev) => (prev === nextHash ? prev : nextHash));
    };

    syncHashState();
    window.addEventListener("hashchange", syncHashState);
    return () => window.removeEventListener("hashchange", syncHashState);
  }, []);

  const routeTarget = useMemo(
    () =>
      resolveHashToActiveChat(routeHash, {
        activeChat: null,
        currentUser,
        conversationPreviews,
        roomPreviews,
        servers,
        serverChannels,
        searchResults,
      }),
    [
      routeHash,
      currentUser,
      conversationPreviews,
      roomPreviews,
      servers,
      serverChannels,
      searchResults,
    ],
  );
  const routeTargetKey = activeChatKey(routeTarget);

  useEffect(() => {
    if (!routeHash || routeHash === "#") return;

    if (routeTarget?.type === "settings") {
      setShowSettings(true);
      return;
    }

    if (routeTarget && routeTargetKey !== currentActiveChatKeyRef.current) {
      setActiveChat(routeTarget);
    }
  }, [
    routeHash,
    routeTarget,
    routeTargetKey,
    setActiveChat,
  ]);

  useEffect(() => {
    if (!activeChat) return;

    const newHash = buildHashForActiveChat(activeChat, {
      activeChat,
      currentUser,
      conversationPreviews,
      roomPreviews,
      servers,
      serverChannels,
      searchResults,
    });

    if (newHash && routeHash !== newHash) {
      window.history.replaceState(null, "", newHash);
      setRouteHash(newHash);
    }
  }, [
    activeChat,
    currentUser,
    conversationPreviews,
    roomPreviews,
    servers,
    serverChannels,
    searchResults,
    routeHash,
  ]);

  useEffect(() => {
    if (showSettings && routeHash !== "#/settings") {
      window.history.replaceState(null, "", "#/settings");
      setRouteHash("#/settings");
    } else if (!showSettings && routeHash === "#/settings") {
      if (activeChat) {
        const newHash = buildHashForActiveChat(activeChat, {
          activeChat,
          currentUser,
          conversationPreviews,
          roomPreviews,
          servers,
          serverChannels,
          searchResults,
        });
        window.history.replaceState(null, "", newHash || "#");
        setRouteHash(newHash || "#");
      } else {
        window.history.replaceState(null, "", "#");
        setRouteHash("#");
      }
    }
  }, [
    showSettings,
    activeChat,
    currentUser,
    conversationPreviews,
    roomPreviews,
    servers,
    serverChannels,
    searchResults,
    routeHash,
  ]);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useAuthHydration();
  useSocketEvents();

  const lastServerIdRef = useRef<number | null>(null);

  const showChannelPanel =
    activeChat?.type === "server" || activeChat?.type === "channel";

  const channelPanelServerId =
    activeChat?.type === "server"
      ? activeChat.serverId
      : activeChat?.type === "channel"
        ? activeChat.serverId
        : null;

  if (channelPanelServerId !== null) {
    lastServerIdRef.current = channelPanelServerId;
  }
  const persistedServerId = lastServerIdRef.current;

  const chatTarget = useMemo(() => {
    if (activeChat?.type === "channel") {
      return {
        type: "room" as const,
        roomId: activeChat.channelId,
        roomRef: activeChat.channelRef,
      };
    }

    if (activeChat?.type === "server") {
      return null;
    }

    return activeChat;
  }, [activeChat]);

  if (!currentUser) {
    return <AuthPage />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <audio ref={audioRef} autoPlay hidden />

      <div className="flex h-full w-[400px] flex-shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar isServerMode={showChannelPanel} />

          {showChannelPanel && persistedServerId !== null && (
            <div className="w-[320px] border-l border-border">
              <ChannelPanel serverId={persistedServerId} />
            </div>
          )}
        </div>

        <SidebarFooter
          callStatus={status}
          remoteUsername={remoteUsername}
          callSeconds={seconds}
          isMuted={isMuted}
          onMuteToggle={toggleMute}
          onHangUp={hangUp}
          onAcceptCall={acceptCall}
          onRejectCall={rejectCall}
          onOpenSettings={() => setShowSettings(true)}
        />
      </div>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        {chatTarget ? (
          <ChatWindow
            activeChat={chatTarget}
            callStatus={status}
            onStartCall={startCall}
          />
        ) : activeChat?.type === "server" ? (
          <EmptyState
            eyebrow="Workspace"
            title="Choose a channel"
            description="Open any channel to start messaging."
            mode="channel"
          />
        ) : (
          <EmptyState
            eyebrow="Inbox"
            title="Pick a conversation"
            description="Select a chat or start a new one."
            actionLabel="Start a new conversation"
            onAction={() => openModal("CREATE_PICKER")}
            mode="conversation"
          />
        )}
      </div>

      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}

      {status === "ringing" && (
        <IncomingCallModal
          callerName={remoteUsername ?? `User #${remoteUserId}`}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {status === "active" && (
        <ActiveCallWindow
          remoteStream={remoteStream}
          remoteUsername={remoteUsername ?? `User #${remoteUserId}`}
          seconds={seconds}
          isMuted={isMuted}
          diagnostics={diagnostics}
          onMuteToggle={toggleMute}
          onHangUp={hangUp}
        />
      )}

      <ToastHost />
    </div>
  );
}

export default App;
