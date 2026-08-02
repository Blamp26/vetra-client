import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useAppStore } from "@/store";
import { AuthPage } from "@/features/registration/AuthPage";
import { UpdateRequiredScreen } from "@/features/registration/UpdateRequiredScreen";
import { Sidebar } from "@/features/messaging/components/Sidebar";
import { SidebarFooter } from "@/features/messaging/components/Sidebar/SidebarFooter";
import { GroupManagementHost } from "@/features/messaging/components/GroupManagement/GroupManagementHost";
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
import { EmptyPane } from "@/shared/components/EmptyPane";
import { Button } from "@/shared/components/Button";
import { DesktopTitleBar } from "@/shared/components/DesktopTitleBar/DesktopTitleBar";
import {
  CallRuntimeBoundary,
  type PersistentCallAffordance,
} from "@/features/calling/context/CallRuntimeBoundary";
import { PersistentCallSurface } from "@/features/calling/components/PersistentCallSurface/PersistentCallSurface";
import { useOptionalPersistentCall } from "@/features/calling/context/PersistentCallContext";
import {
  persistentCallSidebarModel,
  usePersistentCallElapsedSeconds,
} from "@/features/calling/components/PersistentCallSurface/PersistentCallViewModel";
import type { UseCallReturn } from "@/features/calling/hooks/useCall.types";
import { debugCall } from "@/features/calling/utils/callDebug";
import {
  PersistentCallDebugPanel,
  PersistentCallDiagnosticsShortcut,
} from "@/features/calling/components/PersistentCallDebugPanel";
import type { ActiveChat } from "@/shared/types";
import { startMediaDeviceObserver } from "@/shared/utils/mediaDeviceObserver";
import { BroadcastChannelWorkspace } from "@/features/broadcastChannels/components/BroadcastChannelWorkspace";
import { BroadcastInviteView } from "@/features/broadcastChannels/components/BroadcastInviteView";
import { subscribeBroadcastUserEvents } from "@/features/broadcastChannels/services/broadcastRealtime";
import { showBroadcastNotification } from "@/services/notifications";
import { isReservedBroadcastRootName } from "@/features/broadcastChannels/rootNames";

const LEFT_PANE_STORAGE_KEY = "vetra:left-pane-width";
const LEFT_PANE_MODE_STORAGE_KEY = "vetra:left-pane-mode";
const LEFT_TEXT_MIN_WIDTH = 333;
const LEFT_PANE_DEFAULT_WIDTH = 408;
const RIGHT_PANE_MIN_WIDTH = 380;
const LEFT_PANE_KEYBOARD_STEP = 16;

type BroadcastRoute =
  | { channelPublicId: string; publicationId?: string }
  | { inviteToken: string }
  | { channelPublicId?: undefined; publicationId?: undefined };

function getTextPaneMaxWidth(availableWidth: number) {
  return Math.max(LEFT_TEXT_MIN_WIDTH, availableWidth - RIGHT_PANE_MIN_WIDTH);
}

function resolveTextPaneWidth(width: number, availableWidth: number) {
  const maxWidth = getTextPaneMaxWidth(availableWidth);
  return Math.min(maxWidth, Math.max(LEFT_TEXT_MIN_WIDTH, Math.round(width)));
}

function getInitialLeftPaneWidth(): number {
  if (typeof window === "undefined") {
    return LEFT_PANE_DEFAULT_WIDTH;
  }

  const storedMode = window.localStorage.getItem(LEFT_PANE_MODE_STORAGE_KEY);
  const storedWidth = window.localStorage.getItem(LEFT_PANE_STORAGE_KEY);
  const parsedWidth = storedWidth
    ? Number.parseInt(storedWidth, 10)
    : Number.NaN;
  const hasStoredWidth = Number.isFinite(parsedWidth);

  if (storedMode === "collapsed") {
    return LEFT_TEXT_MIN_WIDTH;
  }

  if (storedMode === "text") {
    return resolveTextPaneWidth(
      hasStoredWidth ? parsedWidth : LEFT_PANE_DEFAULT_WIDTH,
      window.innerWidth,
    );
  }

  if (hasStoredWidth && (parsedWidth === 148 || parsedWidth === 139)) {
    return LEFT_TEXT_MIN_WIDTH;
  }

  return resolveTextPaneWidth(
    hasStoredWidth
      ? Math.max(parsedWidth, LEFT_TEXT_MIN_WIDTH)
      : LEFT_PANE_DEFAULT_WIDTH,
    window.innerWidth,
  );
}

function App() {
  const currentUser = useAppStore((s) => s.currentUser);
  const socketManager = useAppStore((s) => s.socketManager);
  const setBroadcastUnread = useAppStore((s) => s.setBroadcastUnread);
  const protocolUpdateRequired = useAppStore((s) => s.protocolUpdateRequired);
  useAuthHydration();
  useSocketEvents();

  useEffect(() => {
    if (!currentUser || !socketManager) return;
    return subscribeBroadcastUserEvents(socketManager, {
      onUnread: (payload) => {
        const event = payload as { channel_public_id?: string; eligible?: boolean };
        if (event.channel_public_id && event.eligible !== false) setBroadcastUnread(event.channel_public_id, true);
      },
      onNotification: (payload) => { void showBroadcastNotification(payload as Parameters<typeof showBroadcastNotification>[0]); },
    });
  }, [currentUser, setBroadcastUnread, socketManager]);

  useEffect(() => {
    if (!currentUser) return;
    return startMediaDeviceObserver();
  }, [currentUser]);

  if (protocolUpdateRequired) {
    return <UpdateRequiredScreen />;
  }

  if (!currentUser) {
    return <AuthPage />;
  }

  return (
    <CallRuntimeBoundary
      currentUser={currentUser}
      socketManager={socketManager}
      nonCallContent={<AppShell call={null} />}
      persistentContent={(affordance) => (
        <PersistentCallApplication affordance={affordance} />
      )}
    />
  );
}

function PersistentCallApplication({
  affordance,
}: {
  affordance: PersistentCallAffordance;
}) {
  const appShell = (
    <AppShell call={null} persistentCallAffordance={affordance} />
  );
  return affordance.state === "owner" ? (
    <PersistentCallSurface>{appShell}</PersistentCallSurface>
  ) : (
    appShell
  );
}

export interface AppShellProps {
  call: UseCallReturn | null;
  persistentCallAffordance?: PersistentCallAffordance;
}

export function AppShell({ call, persistentCallAffordance }: AppShellProps) {
  const persistentCall = useOptionalPersistentCall();
  const persistentSeconds = usePersistentCallElapsedSeconds(
    persistentCall?.presentation ?? null,
  );
  const persistentSidebar = persistentCall
    ? persistentCallSidebarModel(persistentCall, persistentSeconds)
    : null;
  const persistentPrePresentation =
    persistentCall?.ux.status.kind === "idle" && persistentCall.ux.actionBusy;
  const persistentCallIssue = persistentCall?.presentation.callIssue
    ? {
        tone: "error" as const,
        message: persistentCall.presentation.callIssue.message,
      }
    : null;
  const currentUser = useAppStore((s) => s.currentUser);
  const {
    status = persistentSidebar?.status ?? "idle",
    remoteUsername = persistentSidebar?.remoteUsername ?? null,
    remoteUserId = persistentCall?.presentation.peerPublicId ?? null,
    isMuted = persistentCall?.isMuted ?? false,
    muted = persistentCall?.muted ?? isMuted,
    deafened = persistentCall?.deafened ?? false,
    effectiveMuted = persistentCall?.effectiveMuted ?? (muted || deafened),
    canToggleMute = persistentCall?.canToggleMute ?? false,
    canToggleDeafen = persistentCall?.canToggleDeafen ?? false,
    isScreenSharing = false,
    isScreenShareUpdating = false,
    seconds = persistentSidebar?.seconds ?? 0,
    callIssue = persistentSidebar?.callIssue ?? persistentCallIssue,
    isIncomingActionPending = persistentSidebar?.isIncomingActionPending ??
      false,
  } = call ?? {};
  const resolvedStatus = call?.status ?? status;
  const isResolvedActive =
    resolvedStatus === "active" || resolvedStatus === "connected";
  const resolvedRemoteUsername = call?.remoteUsername ?? remoteUsername;
  const resolvedRemoteUserId = call?.remoteUserId ?? remoteUserId;
  const resolvedIsMuted = call?.isMuted ?? isMuted;
  const resolvedMuted = call?.muted ?? muted;
  const resolvedDeafened = call?.deafened ?? deafened;
  const resolvedEffectiveMuted = call?.effectiveMuted ?? effectiveMuted;
  const resolvedCanToggleMute = call?.canToggleMute ?? canToggleMute;
  const resolvedCanToggleDeafen = call?.canToggleDeafen ?? canToggleDeafen;
  const resolvedCallIssue = call?.callIssue ?? callIssue;
  const resolvedIncomingActionPending =
    call?.isIncomingActionPending ?? isIncomingActionPending;
  const activeChat = useAppStore((s) => s.activeChat);
  const debugPeerUuidSource = persistentCall?.presentation.peerPublicId
    ? ("user" as const)
    : activeChat?.type === "direct" && activeChat.partnerRef !== undefined
      ? ("partnerRef" as const)
      : ("none" as const);
  const debugPeerUuidValid = Boolean(
    persistentCall?.presentation.peerPublicId ||
    (activeChat?.type === "direct" && activeChat.partnerRef !== undefined),
  );
  const conversationPreviews = useAppStore((s) => s.conversationPreviews);
  const roomPreviews = useAppStore((s) => s.roomPreviews);
  const servers = useAppStore((s) => s.servers);
  const serverChannels = useAppStore((s) => s.serverChannels);
  const searchResults = useAppStore((s) => s.searchResults);
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const openModal = useAppStore((s) => s.openModal);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const leftPaneWidthRef = useRef(LEFT_PANE_DEFAULT_WIDTH);
  const isResizingRef = useRef(false);

  const [routeHash, setRouteHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash || "#" : "#",
  );
  const [leftPaneWidth, setLeftPaneWidth] = useState(getInitialLeftPaneWidth);
  const [isResizing, setIsResizing] = useState(false);
  const currentActiveChatKey = activeChatKey(activeChat);
  const currentActiveChatKeyRef = useRef(currentActiveChatKey);
  const previousNavigationStateRef = useRef({
    activeChatKey: currentActiveChatKey,
    routeHash,
  });
  const navigationStateInitializedRef = useRef(false);
  const activeCallDirectChatRef = useRef<Extract<
    ActiveChat,
    { type: "direct" }
  > | null>(null);

  useEffect(() => {
    leftPaneWidthRef.current = leftPaneWidth;
  }, [leftPaneWidth]);

  const getAvailableShellWidth = useCallback(() => {
    if (typeof window === "undefined") {
      return LEFT_PANE_DEFAULT_WIDTH + RIGHT_PANE_MIN_WIDTH;
    }

    const shellWidth = shellRef.current?.clientWidth ?? 0;
    return shellWidth > 0 ? shellWidth : window.innerWidth;
  }, []);

  const persistLeftPaneWidth = useCallback((width: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      LEFT_PANE_STORAGE_KEY,
      String(Math.round(width)),
    );
  }, []);

  const updateLeftPaneWidth = useCallback(
    (nextWidth: number) => {
      const resolvedWidth = resolveTextPaneWidth(
        nextWidth,
        getAvailableShellWidth(),
      );
      leftPaneWidthRef.current = resolvedWidth;
      setLeftPaneWidth((previousWidth) =>
        previousWidth === resolvedWidth ? previousWidth : resolvedWidth,
      );
      return resolvedWidth;
    },
    [getAvailableShellWidth],
  );

  const updateLeftPaneFromPointer = useCallback(
    (clientX: number) => {
      const shellLeft = shellRef.current?.getBoundingClientRect().left ?? 0;
      return updateLeftPaneWidth(clientX - shellLeft);
    },
    [updateLeftPaneWidth],
  );

  useEffect(() => {
    currentActiveChatKeyRef.current = currentActiveChatKey;
  }, [currentActiveChatKey]);

  useEffect(() => {
    const handleWindowResize = () => {
      updateLeftPaneWidth(leftPaneWidthRef.current);
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [updateLeftPaneWidth]);

  useEffect(() => {
    if (!isResizing) {
      delete document.body.dataset.vtShellResizing;
      return;
    }

    document.body.dataset.vtShellResizing = "true";
    return () => {
      delete document.body.dataset.vtShellResizing;
    };
  }, [isResizing]);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      updateLeftPaneFromPointer(event.clientX);
    };

    const stopResizing = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      persistLeftPaneWidth(leftPaneWidthRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      stopResizing();
    };
  }, [isResizing, persistLeftPaneWidth, updateLeftPaneFromPointer]);

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
  const broadcastRoute = useMemo<BroadcastRoute | null>(() => {
    const raw = routeHash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (raw[0] === "broadcast" && raw[1]) return { channelPublicId: raw[1], publicationId: raw[2] };
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/invite/") && window.location.pathname.split("/")[2]) return { inviteToken: window.location.pathname.split("/")[2] };
    if (typeof window !== "undefined" && (window.location.pathname === "/api" || window.location.pathname.startsWith("/api/") || window.location.pathname === "/assets" || window.location.pathname.startsWith("/assets/"))) return null;
    if (typeof window !== "undefined" && window.location.pathname.length > 1 && !isReservedBroadcastRootName(window.location.pathname.split("/")[1] ?? "")) return { channelPublicId: undefined, publicationId: undefined };
    return null;
  }, [routeHash]);
  const activeBroadcastChannelPublicId =
    broadcastRoute && "channelPublicId" in broadcastRoute
      ? broadcastRoute.channelPublicId ?? null
      : null;
  const isBroadcastChannelRoute = activeBroadcastChannelPublicId !== null;
  const routeTargetKey = activeChatKey(routeTarget);
  const isSettingsRoute = routeTarget?.type === "settings";
  const routeLookup = useMemo(
    () => ({
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
  const activeChatHash = useMemo(
    () => buildHashForActiveChat(activeChat, routeLookup),
    [activeChat, routeLookup],
  );

  const activeDirectChatMatchesRemote = useCallback(
    (chat: Extract<ActiveChat, { type: "direct" }>) => {
      if (resolvedRemoteUserId === null || resolvedRemoteUserId === undefined)
        return false;

      const remoteRef = String(resolvedRemoteUserId);
      return (
        remoteRef === String(chat.partnerId) ||
        (chat.partnerRef !== undefined &&
          remoteRef === String(chat.partnerRef)) ||
        remoteRef ===
          String(conversationPreviews[chat.partnerId]?.partner_public_id ?? "")
      );
    },
    [conversationPreviews, resolvedRemoteUserId],
  );

  useEffect(() => {
    if (
      (resolvedStatus === "idle" && !persistentPrePresentation) ||
      resolvedStatus === "ended" ||
      resolvedStatus === "failed"
    ) {
      activeCallDirectChatRef.current = null;
      return;
    }

    if (activeChat?.type !== "direct") return;

    if (
      (resolvedStatus === "calling" || persistentPrePresentation) &&
      !activeCallDirectChatRef.current
    ) {
      activeCallDirectChatRef.current = activeChat;
      return;
    }

    if (activeDirectChatMatchesRemote(activeChat)) {
      activeCallDirectChatRef.current = activeChat;
    }
  }, [
    activeChat,
    activeDirectChatMatchesRemote,
    persistentPrePresentation,
    resolvedStatus,
  ]);

  const activeCallChatTarget = useMemo((): Extract<
    ActiveChat,
    { type: "direct" }
  > | null => {
    if (
      !isResolvedActive ||
      resolvedRemoteUserId === null ||
      resolvedRemoteUserId === undefined
    ) {
      return null;
    }

    if (activeCallDirectChatRef.current) {
      return activeCallDirectChatRef.current;
    }

    if (
      typeof resolvedRemoteUserId === "number" ||
      /^\d+$/.test(String(resolvedRemoteUserId))
    ) {
      const numericRemoteId = Number(resolvedRemoteUserId);
      return {
        type: "direct",
        partnerId: numericRemoteId,
        partnerRef: numericRemoteId,
      };
    }

    const resolved = resolveHashToActiveChat(
      `#/${resolvedRemoteUserId}`,
      routeLookup,
    );
    if (resolved?.type === "direct") {
      return resolved;
    }

    if (
      activeChat?.type === "direct" &&
      activeDirectChatMatchesRemote(activeChat)
    ) {
      return activeChat;
    }

    return null;
  }, [
    activeChat,
    activeDirectChatMatchesRemote,
    resolvedRemoteUserId,
    routeLookup,
    isResolvedActive,
  ]);

  const activeCallChatHash = useMemo(
    () =>
      activeCallChatTarget
        ? buildHashForActiveChat(activeCallChatTarget, routeLookup)
        : null,
    [activeCallChatTarget, routeLookup],
  );

  const handleReturnToActiveCall = useCallback(() => {
    if (!isResolvedActive) return;

    debugCall("[AppShell] return to call requested", {
      remoteUserId: resolvedRemoteUserId,
      activeCallChatTarget,
      activeCallChatHash,
      routeHash,
      activeChatKey: currentActiveChatKeyRef.current,
    });

    if (!activeCallChatHash) {
      debugCall("[AppShell] return to call skipped", {
        reason: "missing_active_call_route",
        remoteUserId: resolvedRemoteUserId,
      });
      return;
    }

    if (
      activeCallChatTarget &&
      activeChatKey(activeCallChatTarget) === currentActiveChatKeyRef.current
    ) {
      debugCall("[AppShell] return to call skipped", {
        reason: "already_on_call_chat",
        remoteUserId: resolvedRemoteUserId,
        activeCallChatHash,
      });
      navigateToHash(activeCallChatHash);
      return;
    }

    if (activeCallChatTarget) {
      setActiveChat(activeCallChatTarget);
    }
    navigateToHash(activeCallChatHash);
  }, [
    activeCallChatHash,
    activeCallChatTarget,
    navigateToHash,
    resolvedRemoteUserId,
    routeHash,
    setActiveChat,
    isResolvedActive,
  ]);

  useEffect(() => {
    if (!routeHash || routeHash === "#") return;

    if (isSettingsRoute) {
      return;
    }
    if (isBroadcastChannelRoute) {
      return;
    }

    const previous = previousNavigationStateRef.current;
    const activeChanged = previous.activeChatKey !== currentActiveChatKey;
    const routeChanged = previous.routeHash !== routeHash;

    // The active-chat store is the authority for normal sidebar actions. A
    // route change is authoritative only when it was not accompanied by an
    // active-chat change in the same render. This prevents the two sync
    // effects from undoing each other during an explicit chat switch.
    if (
      routeTarget &&
      (!navigationStateInitializedRef.current ||
        (routeChanged && !activeChanged)) &&
      routeTargetKey !== currentActiveChatKey
    ) {
      setActiveChat(routeTarget);
    }
  }, [
    currentActiveChatKey,
    routeHash,
    routeTarget,
    routeTargetKey,
    isSettingsRoute,
    isBroadcastChannelRoute,
    setActiveChat,
  ]);

  useEffect(() => {
    if (!activeChat) return;
    if (isSettingsRoute) return;
    if (
      isResolvedActive &&
      activeCallChatHash &&
      routeHash === activeCallChatHash &&
      routeTarget &&
      routeTargetKey !== currentActiveChatKeyRef.current
    ) {
      return;
    }

    const previous = previousNavigationStateRef.current;
    const activeChanged = previous.activeChatKey !== currentActiveChatKey;
    const routeChanged = previous.routeHash !== routeHash;

    // Keep a broadcast route authoritative until an explicit ordinary-chat
    // selection changes activeChat, so stale activeChat cannot replace it.
    if (isBroadcastChannelRoute && !activeChanged) {
      return;
    }

    if (
      activeChatHash &&
      routeHash !== activeChatHash &&
      (!routeChanged || activeChanged)
    ) {
      navigateToHash(activeChatHash);
    }
  }, [
    activeChat,
    activeChatHash,
    activeCallChatHash,
    currentActiveChatKey,
    isSettingsRoute,
    isBroadcastChannelRoute,
    navigateToHash,
    routeHash,
    routeTarget,
    routeTargetKey,
    isResolvedActive,
  ]);

  useEffect(() => {
    previousNavigationStateRef.current = {
      activeChatKey: currentActiveChatKey,
      routeHash,
    };
    navigationStateInitializedRef.current = true;
  }, [currentActiveChatKey, routeHash]);

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
    if (activeChat?.type === "server") {
      return null;
    }

    return activeChat;
  }, [activeChat]);

  const handleSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      isResizingRef.current = true;
      setIsResizing(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateLeftPaneFromPointer(event.clientX);
    },
    [updateLeftPaneFromPointer],
  );

  const handleSplitterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      let nextWidth = leftPaneWidthRef.current;

      switch (event.key) {
        case "ArrowLeft":
          nextWidth = Math.max(
            LEFT_TEXT_MIN_WIDTH,
            leftPaneWidthRef.current - LEFT_PANE_KEYBOARD_STEP,
          );
          break;
        case "ArrowRight":
          nextWidth = leftPaneWidthRef.current + LEFT_PANE_KEYBOARD_STEP;
          break;
        case "Home":
          nextWidth = LEFT_TEXT_MIN_WIDTH;
          break;
        case "End":
          nextWidth = getTextPaneMaxWidth(getAvailableShellWidth());
          break;
        default:
          return;
      }

      event.preventDefault();
      const resolvedWidth = updateLeftPaneWidth(nextWidth);
      persistLeftPaneWidth(resolvedWidth);
    },
    [getAvailableShellWidth, persistLeftPaneWidth, updateLeftPaneWidth],
  );

  const handleSplitterDoubleClick = useCallback(() => {
    const resolvedWidth = updateLeftPaneWidth(LEFT_PANE_DEFAULT_WIDTH);
    persistLeftPaneWidth(resolvedWidth);
  }, [persistLeftPaneWidth, updateLeftPaneWidth]);

  const shellStyle = useMemo(
    () =>
      ({
        "--vetra-left-pane-width": `${leftPaneWidth}px`,
      }) as CSSProperties,
    [leftPaneWidth],
  );

  const dividerMaxWidth = getTextPaneMaxWidth(getAvailableShellWidth());

  return (
    <div className="vt-workspace flex h-[100dvh] w-full flex-col overflow-hidden text-foreground">
      <DesktopTitleBar />

      <div
        ref={shellRef}
        className="vt-messenger-shell flex min-h-0 flex-1 overflow-hidden"
        style={shellStyle}
        data-testid="app-shell"
      >
        <div
          className="flex h-full w-[var(--vetra-left-pane-width)] flex-shrink-0 flex-col overflow-hidden bg-[var(--vetra-shell-sidebar-bg)]"
          data-testid="app-sidebar-shell"
          data-pane-mode="text"
        >
          <div className="flex flex-1 overflow-hidden">
            <Sidebar
              isServerMode={showChannelPanel}
              serverPanel={
                persistedServerId !== null ? (
                  <ChannelPanel serverId={persistedServerId} />
                ) : null
              }
              activeBroadcastChannelPublicId={activeBroadcastChannelPublicId}
              onNavigateToHash={navigateToHash}
            />
          </div>

          <SidebarFooter
            callStatus={
              resolvedStatus === "connected" ? "active" : resolvedStatus
            }
            callUxStatus={persistentCall?.ux.status.kind}
            remoteUsername={resolvedRemoteUsername}
            callSeconds={seconds}
            isMuted={resolvedIsMuted}
            muted={resolvedMuted}
            deafened={resolvedDeafened}
            effectiveMuted={resolvedEffectiveMuted}
            canToggleMute={resolvedCanToggleMute}
            canToggleDeafen={resolvedCanToggleDeafen}
            isScreenSharing={isScreenSharing}
            isScreenShareUpdating={isScreenShareUpdating}
            callIssue={resolvedCallIssue}
            isIncomingActionPending={resolvedIncomingActionPending}
            onMuteToggle={
              call?.toggleMute ??
              (() => {
                persistentCall?.toggleMute();
              })
            }
            onDeafenToggle={
              call?.toggleDeafen ??
              (() => {
                persistentCall?.toggleDeafen();
              })
            }
            onHangUp={
              call?.hangUp ??
              (() => {
                void persistentCall?.hangup();
              })
            }
            onCancelCall={
              call
                ? undefined
                : persistentSidebar?.canCancel
                  ? () => {
                      void persistentCall?.cancel();
                    }
                  : undefined
            }
            onAcceptCall={
              call?.acceptCall ??
              (persistentSidebar?.direction === "incoming"
                ? () => {
                    void persistentCall?.accept();
                  }
                : undefined)
            }
            onRejectCall={
              call?.rejectCall ??
              (persistentSidebar?.direction === "incoming"
                ? () => {
                    void persistentCall?.decline();
                  }
                : undefined)
            }
            callDirection={call ? undefined : persistentSidebar?.direction}
            canCancelCall={call ? undefined : persistentSidebar?.canCancel}
            canHangUpCall={call ? undefined : persistentSidebar?.canHangup}
            onOpenSettings={() => navigateToHash("#/settings")}
            onReturnToCall={handleReturnToActiveCall}
          />
        </div>

        <div
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={LEFT_TEXT_MIN_WIDTH}
          aria-valuemax={dividerMaxWidth}
          aria-valuenow={leftPaneWidth}
          tabIndex={0}
          className="vt-shell-divider"
          data-active={isResizing ? "true" : "false"}
          data-testid="app-shell-divider"
          onPointerDown={handleSplitterPointerDown}
          onKeyDown={handleSplitterKeyDown}
          onDoubleClick={handleSplitterDoubleClick}
        />

        <div className="flex min-w-0 flex-1 overflow-hidden bg-[var(--vetra-shell-chat-bg)]">
          {broadcastRoute && "inviteToken" in broadcastRoute ? <BroadcastInviteView token={broadcastRoute.inviteToken ?? ""} /> : broadcastRoute ? (
            <BroadcastChannelWorkspace channelPublicId={broadcastRoute.channelPublicId} publicationId={broadcastRoute.publicationId} />
          ) : !isSettingsRoute && chatTarget ? (
            <ChatWindow
              activeChat={chatTarget}
              call={call}
              persistentCallAffordance={persistentCallAffordance}
            />
          ) : !isSettingsRoute && activeChat?.type === "server" ? (
            <EmptyPane
              title="Choose a channel"
              description="Open any channel to start messaging."
              density="workspace"
              className="flex flex-1 flex-col items-center justify-center px-8 py-10"
            />
          ) : !isSettingsRoute ? (
            <EmptyPane
              title="Pick a conversation"
              description="Select a chat or start a new one."
              action={
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => openModal("CREATE_PICKER")}
                >
                  Start a new conversation
                </Button>
              }
              density="workspace"
              className="flex flex-1 flex-col items-center justify-center px-8 py-10"
            />
          ) : null}
        </div>

        {isSettingsRoute && (
          <SettingsPage onClose={() => navigateToHash(activeChatHash || "#")} />
        )}
      </div>

      {call && resolvedStatus === "ringing" && (
        <IncomingCallModal
          callerName={resolvedRemoteUsername ?? `User #${resolvedRemoteUserId}`}
          isPending={resolvedIncomingActionPending}
          onAccept={call.acceptCall}
          onReject={call.rejectCall}
        />
      )}

      {call?.callSound?.autoplayBlocked &&
        (resolvedStatus === "ringing" ||
          resolvedStatus === "active" ||
          resolvedStatus === "connected") && (
          <div
            className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center"
            data-testid="legacy-call-sound-recovery"
          >
            <Button
              variant="secondary"
              type="button"
              className="pointer-events-auto"
              onClick={() => {
                void call.callSound?.enableCallSounds();
              }}
              aria-label="Enable call sounds"
            >
              Enable call sounds
            </Button>
          </div>
        )}

      <GroupManagementHost />
      <ToastHost />
      <PersistentCallDiagnosticsShortcut />
      <PersistentCallDebugPanel
        activeChatType={activeChat?.type ?? "none"}
        directChat={activeChat?.type === "direct"}
        peerUuidSource={debugPeerUuidSource}
        peerUuidValid={debugPeerUuidValid}
        finalButtonPredicate={
          activeChat?.type === "direct" && debugPeerUuidValid
        }
      />
    </div>
  );
}

export default App;
