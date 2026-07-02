import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
import { IncomingCallModal } from "./features/calling/components/IncomingCallModal";
import { ToastHost } from "@/shared/components/ToastHost/ToastHost";
import { CallProvider, useCallContext } from "@/features/calling/context";
import { debugCall } from "@/features/calling/utils/callDebug";

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
  useAuthHydration();
  useSocketEvents();

  if (!currentUser) {
    return <AuthPage />;
  }

  return (
    <CallProvider currentUserId={currentUser.id}>
      <AppShell />
    </CallProvider>
  );
}

function AppShell() {
  const currentUser = useAppStore((s) => s.currentUser);
  const call = useCallContext();
  const {
    status,
    remoteUsername,
    remoteUserId,
    isMuted,
    isScreenSharing,
    isScreenShareUpdating,
    seconds,
    callIssue,
    isIncomingActionPending,
    toggleMute,
    hangUp,
    acceptCall,
    rejectCall,
  } = call;
  const activeChat = useAppStore((s) => s.activeChat);
  const conversationPreviews = useAppStore((s) => s.conversationPreviews);
  const roomPreviews = useAppStore((s) => s.roomPreviews);
  const servers = useAppStore((s) => s.servers);
  const serverChannels = useAppStore((s) => s.serverChannels);
  const searchResults = useAppStore((s) => s.searchResults);
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const openModal = useAppStore((s) => s.openModal);

  const [routeHash, setRouteHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash || "#" : "#",
  );
  const currentActiveChatKey = activeChatKey(activeChat);
  const currentActiveChatKeyRef = useRef(currentActiveChatKey);

  useEffect(() => {
    currentActiveChatKeyRef.current = currentActiveChatKey;
  }, [currentActiveChatKey]);

  const navigateToHash = useCallback((nextHash: string) => {
    const normalizedHash = nextHash || "#";
    if (typeof window === "undefined") return;
    if ((window.location.hash || "#") === normalizedHash) {
      setRouteHash((prev) => (prev === normalizedHash ? prev : normalizedHash));
      return;
    }

    window.history.replaceState(null, "", normalizedHash);
    setRouteHash(normalizedHash);
  }, []);

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
  const isSettingsRoute = routeTarget?.type === "settings";
  const activeChatHash = useMemo(
    () =>
      buildHashForActiveChat(activeChat, {
        activeChat,
        currentUser,
        conversationPreviews,
        roomPreviews,
        servers,
        serverChannels,
        searchResults,
      }),
    [
      activeChat,
      currentUser,
      conversationPreviews,
      roomPreviews,
      servers,
      serverChannels,
      searchResults,
    ],
  );

  const activeCallChatHash = useMemo(() => {
    if (status !== "active" || remoteUserId === null || remoteUserId === undefined) {
      return null;
    }

    const lookup = {
      activeChat,
      currentUser,
      conversationPreviews,
      roomPreviews,
      servers,
      serverChannels,
      searchResults,
    };

    if (typeof remoteUserId === "number") {
      return buildHashForActiveChat(
        { type: "direct", partnerId: remoteUserId, partnerRef: remoteUserId },
        lookup,
      );
    }

    const resolved = resolveHashToActiveChat(`#/${remoteUserId}`, lookup);
    if (resolved?.type === "direct") {
      return buildHashForActiveChat(resolved, lookup);
    }

    return `#/${remoteUserId}`;
  }, [
    activeChat,
    conversationPreviews,
    currentUser,
    remoteUserId,
    roomPreviews,
    searchResults,
    serverChannels,
    servers,
    status,
  ]);

  const handleReturnToActiveCall = useCallback(() => {
    if (status !== "active") return;

    debugCall("[AppShell] return to call requested", {
      remoteUserId,
      activeCallChatHash,
      routeHash,
      activeChatKey: currentActiveChatKeyRef.current,
    });

    if (!activeCallChatHash) {
      debugCall("[AppShell] return to call skipped", {
        reason: "missing_active_call_route",
        remoteUserId,
      });
      return;
    }

    navigateToHash(activeCallChatHash);
  }, [activeCallChatHash, navigateToHash, remoteUserId, routeHash, status]);

  useEffect(() => {
    if (!routeHash || routeHash === "#") return;

    if (isSettingsRoute) {
      return;
    }

    if (routeTarget && routeTargetKey !== currentActiveChatKeyRef.current) {
      setActiveChat(routeTarget);
    }
  }, [
    routeHash,
    routeTarget,
    routeTargetKey,
    isSettingsRoute,
    setActiveChat,
  ]);

  useEffect(() => {
    if (!activeChat) return;
    if (isSettingsRoute) return;
    if (
      status === "active" &&
      activeCallChatHash &&
      routeHash === activeCallChatHash &&
      routeTarget &&
      routeTargetKey !== currentActiveChatKeyRef.current
    ) {
      return;
    }

    if (activeChatHash && routeHash !== activeChatHash) {
      navigateToHash(activeChatHash);
    }
  }, [
    activeChat,
    activeChatHash,
    activeCallChatHash,
    isSettingsRoute,
    navigateToHash,
    routeHash,
    routeTarget,
    routeTargetKey,
    status,
  ]);

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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
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
          isScreenSharing={isScreenSharing}
          isScreenShareUpdating={isScreenShareUpdating}
          callIssue={callIssue}
          isIncomingActionPending={isIncomingActionPending}
          onMuteToggle={toggleMute}
          onHangUp={hangUp}
          onAcceptCall={acceptCall}
          onRejectCall={rejectCall}
          onOpenSettings={() => navigateToHash("#/settings")}
          onReturnToCall={handleReturnToActiveCall}
        />
      </div>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        {!isSettingsRoute && chatTarget ? (
          <ChatWindow
            activeChat={chatTarget}
            call={call}
          />
        ) : !isSettingsRoute && activeChat?.type === "server" ? (
          <EmptyState
            eyebrow="Workspace"
            title="Choose a channel"
            description="Open any channel to start messaging."
            mode="channel"
          />
        ) : !isSettingsRoute ? (
          <EmptyState
            eyebrow="Inbox"
            title="Pick a conversation"
            description="Select a chat or start a new one."
            actionLabel="Start a new conversation"
            onAction={() => openModal("CREATE_PICKER")}
            mode="conversation"
          />
        ) : null}
      </div>

      {isSettingsRoute && (
        <SettingsPage onClose={() => navigateToHash(activeChatHash || "#")} />
      )}

      {status === "ringing" && (
        <IncomingCallModal
          callerName={remoteUsername ?? `User #${remoteUserId}`}
          isPending={isIncomingActionPending}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      <ToastHost />
    </div>
  );
}

export default App;
