import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  useUnifiedMessages,
  type ChatContext,
} from "@/features/messaging/hooks/useUnifiedMessages";
import { useAppStore, type RootState } from "@/store";
import { authApi } from "@/api/auth";
import { roomsApi, type GroupGovernance } from "@/api/rooms";
import { RoomMessageSendError } from "@/services/socket";
import { MessageList } from "../MessageList/MessageList";
import { MessageInput } from "../MessageInput/MessageInput";
import { MessageSearch } from "../MessageSearch/MessageSearch";
import { StickerPicker } from "../StickerPicker/StickerPicker";
import { StickerPackPreviewDialog, type StickerPackSelectionRequest } from "../StickerPicker/StickerPackPreviewDialog";
import type { ActiveChat, StickerMessage, User } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { IconButton } from "@/shared/components/IconButton";
import { CallButton } from "@/features/calling/components/CallButton";
import { ActiveCallDock } from "@/features/calling/components/ActiveCallDock";
import type { UseCallReturn } from "@/features/calling/hooks/useCall.types";
import { normalizeCallIssue } from "@/features/calling/utils/callUxText";
import { useOptionalPersistentCall } from "@/features/calling/context/PersistentCallContext";
import type { PersistentCallAffordance } from "@/features/calling/context/CallRuntimeBoundary";
import { PersistentCallButton } from "@/features/calling/components/PersistentCallSurface/PersistentCallSurface";
import { PersistentActiveCallDock } from "@/features/calling/components/PersistentCallSurface/PersistentActiveCallDock";
import { PersistentCallDebugPanel, type PersistentPeerUuidSource } from "@/features/calling/components/PersistentCallDebugPanel";
import { isUuid } from "@/features/calling/protocol/directedCallProtocol";
import { cn } from "@/shared/utils/cn";
import { withFallbackRef } from "@/shared/utils/refs";
import {
  getPresenceText,
  resolvePresenceStatus,
} from "@/shared/utils/presence";
import { Search } from "lucide-react";
import { useDirectedCallHistoryForChat } from "@/features/messaging/hooks/useDirectedCallHistoryForChat";
import { ConversationHeaderShell } from "../ConversationPresentation/ConversationHeaderShell";

interface Props {
  activeChat: ActiveChat;
  call: UseCallReturn | null;
  persistentCallAffordance?: PersistentCallAffordance;
}

interface ReplyTarget {
  id: number;
  content: string;
  author: string;
}

function TypingIndicator({ nickname }: { nickname: string }) {
  return (
    <div className="border-t border-border bg-card/70 px-5 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{nickname}</span>
      <span className="opacity-80 ml-1">is typing...</span>
    </div>
  );
}

function isActiveCallForChat(
  activeChat: ActiveChat,
  call: UseCallReturn | null,
  conversationPreviews: RootState["conversationPreviews"],
): boolean {
  if (!call || call.status !== "active") return false;
  if (activeChat.type !== "direct") return false;
  if (call.remoteUserId === null || call.remoteUserId === undefined) return false;

  const callRemoteId = String(call.remoteUserId);
  return (
    callRemoteId === String(activeChat.partnerId) ||
    (activeChat.partnerRef !== undefined && callRemoteId === String(activeChat.partnerRef)) ||
    callRemoteId === String(conversationPreviews[activeChat.partnerId]?.partner_public_id ?? "")
  );
}

export function ChatWindow({ activeChat, call, persistentCallAffordance }: Props) {
  const persistentCall = useOptionalPersistentCall();
  const { entries: directedCallHistoryEntries } = useDirectedCallHistoryForChat(activeChat);
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const socketManager = useAppStore((s: RootState) => s.socketManager);
  const [groupGovernance, setGroupGovernance] = useState<GroupGovernance | null>(null);
  const [slowModeUntil, setSlowModeUntil] = useState<string | null>(null);
  const governanceRequestRef = useRef(0);

  const reconcileGovernance = useCallback(async () => {
    if (activeChat.type !== "room") return;
    const request = ++governanceRequestRef.current;
    const roomId = activeChat.roomId;
    const value = await roomsApi.governance(activeChat.roomRef ?? roomId);
    if (request !== governanceRequestRef.current || activeChat.type !== "room" || activeChat.roomId !== roomId) return;
    setGroupGovernance(value);
    setSlowModeUntil(value.slow_mode?.next_allowed_at ?? null);
    if (!value.action_capabilities?.send_stickers_gifs) setPickerOpen(false);
  }, [activeChat]);

  useEffect(() => {
    governanceRequestRef.current += 1;
    if (activeChat.type !== "room") {
      setGroupGovernance(null);
      setSlowModeUntil(null);
      return;
    }
    setGroupGovernance(null);
    setSlowModeUntil(null);
    void reconcileGovernance().catch(() => undefined);
  }, [activeChat, reconcileGovernance]);

  useEffect(() => {
    if (activeChat.type !== "room" || !socketManager) return;
    const roomId = activeChat.roomId;
    return socketManager.onGroupGovernanceChanged((event) => {
      if (event.room_id !== roomId) return;
      void reconcileGovernance().catch(() => undefined);
    });
  }, [activeChat, socketManager, reconcileGovernance]);

  const groupPermissions = activeChat.type === "room"
    ? (groupGovernance?.effective_permissions ?? [])
    : undefined;

  const onlineUserIds = useAppStore((s: RootState) => s.onlineUserIds);
  const userStatuses = useAppStore((s: RootState) => s.userStatuses);
  const lastSeenAt = useAppStore((s: RootState) => s.lastSeenAt);
  const typingPartnerIds = useAppStore((s: RootState) => s.typingPartnerIds);

  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);
  const conversationPreviews = useAppStore(
    (s: RootState) => s.conversationPreviews,
  );
  const typingRoomMemberIds = useAppStore(
    (s: RootState) => s.typingRoomMemberIds,
  );
  const typingRoomMemberInfo = useAppStore(
    (s: RootState) => s.typingRoomMemberInfo,
  );
  const servers = useAppStore((s: RootState) => s.servers);
  const serverChannels = useAppStore((s: RootState) => s.serverChannels);

  const [partner, setPartner] = useState<User | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const groupProfileTriggerRef = useRef<HTMLButtonElement>(null);
  const openGroupProfile = useAppStore((s: RootState) => s.openGroupProfile);
  const closeGroupSurface = useAppStore((s: RootState) => s.closeGroupSurface);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [callStartIssue, setCallStartIssue] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stickerPreview, setStickerPreview] = useState<StickerPackSelectionRequest | null>(null);
  const [pickerSelectionRequest, setPickerSelectionRequest] = useState<StickerPackSelectionRequest | null>(null);
  const stickerRequestRevision = useRef(0);
  const stickerTriggerRef = useRef<HTMLElement | null>(null);
  const customEmojiInserterRef = useRef<(emoji: StickerMessage) => void>(() => undefined);
  const lastDirectIdentityRef = useRef<ReactNode | null>(null);
  const lastServerIdentityRef = useRef<ReactNode | null>(null);
  const activeChatType = activeChat.type;
  const activePartnerId =
    activeChat.type === "direct" ? activeChat.partnerId : null;
  const activePartnerRef =
    activeChat.type === "direct" ? activeChat.partnerRef : undefined;
  const activeRoomId = activeChat.type === "room" ? activeChat.roomId : null;
  const activeRoomRef =
    activeChat.type === "room" ? activeChat.roomRef : undefined;
  const directPreviewPublicId =
    activePartnerId !== null
      ? conversationPreviews[activePartnerId]?.partner_public_id
      : undefined;

  const persistentPeerCandidates: Array<{ value: unknown; source: PersistentPeerUuidSource }> = [
    { value: partner?.public_id, source: "user" },
    { value: directPreviewPublicId, source: "preview" },
    { value: activePartnerRef, source: "partnerRef" },
  ];
  const persistentPeerCandidate = activeChat.type === "direct"
    ? persistentPeerCandidates.find(({ value }) => typeof value === "string" && isUuid(value))
    : undefined;
  const persistentPeerPublicId: string | null = typeof persistentPeerCandidate?.value === "string"
    ? persistentPeerCandidate.value
    : null;
  const persistentPeerUuidSource: PersistentPeerUuidSource = persistentPeerCandidate?.source ?? "none";

  const chatContext = useMemo((): ChatContext | null => {
    if (activePartnerId !== null)
      return {
        type: "direct",
        partnerId: activePartnerId,
        partnerRef: activePartnerRef,
      };
    if (activeRoomId !== null)
      return {
        type: "room",
        roomId: activeRoomId,
        roomRef: activeRoomRef,
      };
    if (activeChat.type === "channel")
      return {
        type: "room",
        roomId: activeChat.channelId,
        roomRef: activeChat.channelRef,
        isServerChannel: true,
        serverId: activeChat.serverId,
      };
    return null;
  }, [activeChat, activePartnerId, activePartnerRef, activeRoomId, activeRoomRef]);

  const openStickerPreview = useCallback((packId: string, stickerId: string) => {
    stickerTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stickerRequestRevision.current += 1;
    setStickerPreview({ packId, stickerId, revision: stickerRequestRevision.current });
  }, []);

  const closeStickerPreview = useCallback(() => {
    setStickerPreview(null);
  }, []);

  const openStickerPack = useCallback((packId: string) => {
    stickerRequestRevision.current += 1;
    setPickerSelectionRequest({ packId, stickerId: "", revision: stickerRequestRevision.current });
    setPickerOpen(true);
    setStickerPreview(null);
  }, []);

  const handleSelectionHandled = useCallback((revision: number) => {
    setPickerSelectionRequest((current) => current?.revision === revision ? null : current);
  }, []);

  useEffect(() => {
    if (!stickerPreview) return;
    const closePreview = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setStickerPreview(null);
    };
    window.addEventListener("keydown", closePreview, true);
    return () => window.removeEventListener("keydown", closePreview, true);
  }, [stickerPreview]);

  useEffect(() => {
    if (stickerPreview || !stickerTriggerRef.current) return;
    stickerTriggerRef.current.focus();
    stickerTriggerRef.current = null;
  }, [stickerPreview]);

  const { messages, isLoading, hasMore, loadMore, initialHistoryLoaded, sendMessage } =
    useUnifiedMessages(chatContext);

  const sendWithGovernance = useCallback(
    async (...args: Parameters<typeof sendMessage>) => {
      try {
        await sendMessage(...args);
        const slowMode = groupGovernance?.slow_mode;
        if (activeChat.type === "room" && slowMode?.applies && slowMode.seconds > 0) {
          setSlowModeUntil(new Date(Date.now() + slowMode.seconds * 1000).toISOString());
        }
      } catch (error) {
        if (error instanceof RoomMessageSendError && error.reason === "slow_mode") {
          const fallback = error.remainingSeconds
            ? new Date(Date.now() + error.remainingSeconds * 1000).toISOString()
            : null;
          await reconcileGovernance().catch(() => undefined);
          setSlowModeUntil(error.nextAllowedAt ?? fallback);
        }
        throw error;
      }
    },
    [activeChat.type, groupGovernance?.slow_mode, reconcileGovernance, sendMessage],
  );

  const chatId =
    activeChat.type === "direct"
      ? activeChat.partnerId
      : activeChat.type === "room"
        ? activeChat.roomId
        : activeChat.type === "channel"
          ? activeChat.channelId
        : 0;
  const directPartnerRef = useMemo(
    () =>
      activePartnerId !== null
        ? withFallbackRef(
            activePartnerId,
            activePartnerRef,
            directPreviewPublicId
              ? {
                  id: activePartnerId,
                  public_id: directPreviewPublicId,
                }
              : undefined,
          )
        : null,
    [activePartnerId, activePartnerRef, directPreviewPublicId],
  );

  useEffect(() => {
    setReplyTo(null);
    setIsSearchOpen(false);
    closeGroupSurface();
    setCallStartIssue(null);
    if (activeChatType === "direct" && activePartnerId !== null) {
      let cancelled = false;
      authApi
        .getUser(directPartnerRef ?? activePartnerId)
        .then((user: User) => {
          if (!cancelled) setPartner(user);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            console.error("Failed to load chat user:", error);
          }
        });
      return () => {
        cancelled = true;
      };
    } else {
      setPartner(null);
    }
  }, [activeChatType, activePartnerId, activeRoomId, activeRoomRef, directPartnerRef, closeGroupSurface]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPickerOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const handleCallUnavailable = useCallback((reason: string) => {
    setCallStartIssue(reason);
  }, []);

  const handleStartCall = useCallback(
    (targetUserId: string | number, targetUsername?: string) => {
      setCallStartIssue(null);
      call?.startCall(targetUserId, targetUsername);
    },
    [call],
  );

  const handleTypingStart = useCallback(() => {
    if (!socketManager || !chatContext) return;
    if (chatContext.type === "direct") {
      socketManager.sendTypingStart(directPartnerRef ?? chatContext.partnerId);
    } else {
      socketManager.sendRoomTypingStart(chatContext.roomId);
    }
  }, [socketManager, chatContext, directPartnerRef]);

  const handleTypingStop = useCallback(() => {
    if (!socketManager || !chatContext) return;
    if (chatContext.type === "direct") {
      socketManager.sendTypingStop(directPartnerRef ?? chatContext.partnerId);
    } else {
      socketManager.sendRoomTypingStop(chatContext.roomId);
    }
  }, [socketManager, chatContext, directPartnerRef]);

  const typingNickname = useMemo(() => {
    if (activeChat.type === "direct") {
      return typingPartnerIds.has(activeChat.partnerId) && partner
        ? partner.display_name || partner.username
        : null;
    } else if (activeChat.type === "room") {
      const names: string[] = [];
      typingRoomMemberIds.forEach((id: number) => {
        const info = typingRoomMemberInfo[id];
        names.push(info?.display_name || info?.username || `User #${id}`);
      });
      return names.length > 0 ? names.join(", ") : null;
    }
    return null;
  }, [
    activeChat,
    typingPartnerIds,
    partner,
    typingRoomMemberIds,
    typingRoomMemberInfo,
  ]);

  if (!currentUser) return null;

  const shouldShowActiveCallDock = isActiveCallForChat(activeChat, call, conversationPreviews);
  const persistentCallPeerPublicId = persistentCall?.presentation.peerPublicId;
  const shouldShowPersistentActiveCallDock = Boolean(
    persistentCall?.presentation.phase === "active" &&
    activeChat.type === "direct" &&
    persistentCallPeerPublicId &&
    (
      partner?.public_id === persistentCallPeerPublicId ||
      String(activeChat.partnerRef ?? "") === persistentCallPeerPublicId ||
      String(conversationPreviews[activeChat.partnerId]?.partner_public_id ?? "") === persistentCallPeerPublicId
    ),
  );
  const displayCallIssue = normalizeCallIssue(call?.callIssue ?? null);

  const renderIdentityLayers = (activeIdentity: "direct" | "server-channel") => {
    let directIdentity: ReactNode = lastDirectIdentityRef.current;
    if (activeChat.type === "direct" && partner) {
      const resolvedLastSeenAt = lastSeenAt[activeChat.partnerId] ?? partner.last_seen_at;
      const currentStatus = resolvePresenceStatus({
        userId: activeChat.partnerId,
        onlineUserIds,
        userStatuses,
        fallbackStatus: partner.status,
        lastSeenAt: resolvedLastSeenAt,
      });
      const statusLine = getPresenceText({
        status: currentStatus,
        lastSeenAt: resolvedLastSeenAt,
      });
      directIdentity = (
        <>
          <Avatar
            name={partner.display_name || partner.username}
            src={partner.avatar_url}
            size="medium"
            status={currentStatus as any}
          />
          <div className="flex min-w-0 flex-col justify-center self-stretch gap-0.5">
            <h3 className="truncate text-[15px] font-semibold leading-5">{partner.display_name || partner.username}</h3>
            <p className="truncate text-[12px] leading-[14px] text-muted-foreground">
              <span data-testid="chat-header-status" className={cn(currentStatus === "online" ? "text-online" : currentStatus === "away" ? "text-away" : currentStatus === "dnd" ? "text-busy" : "text-muted-foreground")}>{statusLine}</span>
            </p>
          </div>
        </>
      );
      lastDirectIdentityRef.current = directIdentity;
    }

    let serverIdentity: ReactNode = lastServerIdentityRef.current;
    if (activeChat.type === "channel") {
      const channel = serverChannels?.[activeChat.serverId]?.find((item) => item.id === activeChat.channelId);
      const server = servers?.[activeChat.serverId];
      const channelName = channel?.name || `#${activeChat.channelId}`;
      serverIdentity = (
        <>
          <Avatar name={channelName} size="medium" />
          <div className="flex min-w-0 flex-col justify-center self-stretch gap-0.5">
            <h3 className="truncate text-[15px] font-semibold leading-5"># {channelName}</h3>
            <p className="truncate text-[12px] leading-[14px] text-muted-foreground">Channel · {server?.name ?? "Server"}</p>
          </div>
        </>
      );
      lastServerIdentityRef.current = serverIdentity;
    }

    return (
      <div className="vt-header-identity-layers" data-active-identity={activeIdentity}>
        <div
          className="vt-header-identity-layer"
          data-identity-layer="direct"
          data-active={activeIdentity === "direct" ? "true" : "false"}
          aria-hidden={activeIdentity !== "direct"}
        >
          {directIdentity}
        </div>
        <div
          className="vt-header-identity-layer"
          data-identity-layer="server-channel"
          data-active={activeIdentity === "server-channel" ? "true" : "false"}
          aria-hidden={activeIdentity !== "server-channel"}
        >
          {serverIdentity}
        </div>
      </div>
    );
  };

  const renderHeader = () => {
    if (activeChat.type === "direct") {
      if (!partner)
        return <ConversationHeaderShell avatar={null} title="Loading..." subtitle="" actions={null} headerProps={{ role: "status", "aria-live": "polite" }} />;

      return (
        <ConversationHeaderShell
          identityLayers={renderIdentityLayers("direct")}
          avatar={null}
          title=""
          subtitle=""
          actions={<>
            {call && <CallButton
              targetUserId={
                partner?.public_id ??
                activeChat.partnerRef ??
                activeChat.partnerId
              }
              targetUsername={partner.display_name || partner.username}
              status={call.status}
              callServiceStatus={call.callServiceStatus}
              onCall={handleStartCall}
              onUnavailable={handleCallUnavailable}
              className="h-10 w-10 rounded-full border-0 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-0"
            />}
            {persistentCallAffordance && activeChat.type === "direct" && persistentPeerPublicId && persistentPeerPublicId !== currentUser.public_id && (
              <PersistentCallButton
                targetUserId={persistentPeerPublicId}
                targetUsername={partner?.display_name || partner?.username || "user"}
                affordance={persistentCallAffordance}
              />
            )}
            <IconButton
              label="Search messages"
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-[18px] w-[18px]" aria-hidden="true" />
            </IconButton>
          </>}
        />
      );
    } else if (activeChat.type === "room" || activeChat.type === "channel") {
      const roomId = activeChat.type === "room" ? activeChat.roomId : activeChat.channelId;
      const roomPreview = roomPreviews[roomId];
      const channel = activeChat.type === "channel"
        ? serverChannels?.[activeChat.serverId]?.find((item) => item.id === activeChat.channelId)
        : undefined;
      const server = activeChat.type === "channel" ? servers?.[activeChat.serverId] : undefined;
      return (
        <ConversationHeaderShell
          identityLayers={activeChat.type === "channel" ? renderIdentityLayers("server-channel") : undefined}
          avatar={channel ? <Avatar name={channel.name} size="medium" /> : <Avatar name={roomPreview?.name || `#${roomId}`} src={roomPreview?.avatar_url ?? null} size="medium" />}
          title={channel ? `# ${channel.name}` : roomPreview?.name || `Room #${roomId}`}
          subtitle={channel ? `Channel · ${server?.name ?? "Server"}` : "Group chat"}
          identityRef={!channel ? groupProfileTriggerRef : undefined}
          identityProps={!channel ? { onClick: () => openGroupProfile(roomId, { onSearchMessages: () => setIsSearchOpen(true), restoreFocus: groupProfileTriggerRef.current }), "aria-label": `Open ${roomPreview?.name || `Room #${roomId}`} group profile` } : undefined}
          actions={
            <IconButton
              label="Search messages"
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-[18px] w-[18px]" aria-hidden="true" />
            </IconButton>
          }
        />
      );
    }
    return null;
  };

  return (
    <>
    <PersistentCallDebugPanel
      activeChatType={activeChat.type}
      directChat={activeChat.type === "direct"}
      peerUuidSource={persistentPeerUuidSource}
      peerUuidValid={persistentPeerPublicId !== null}
      finalButtonPredicate={Boolean(persistentCall && activeChat.type === "direct" && persistentPeerPublicId)}
    />
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-[var(--vetra-shell-chat-bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {renderHeader()}

      {(callStartIssue || (call?.status === "idle" && displayCallIssue?.message)) && (
        <div
          className="border-b border-destructive/40 bg-destructive/10 px-5 py-2 text-sm text-foreground"
          data-testid="call-start-issue"
        >
          {callStartIssue ?? displayCallIssue?.message}
        </div>
      )}

      {shouldShowActiveCallDock && (
        <ActiveCallDock
          currentUser={currentUser}
          remoteUserId={call!.remoteUserId}
          remoteUser={partner}
          remoteUsername={call!.remoteUsername ?? `User #${call!.remoteUserId}`}
          callStatus={call!.status}
          seconds={call!.seconds}
          isMuted={call!.effectiveMuted ?? call!.isMuted}
          muted={call!.muted ?? call!.isMuted}
          deafened={call!.deafened ?? false}
          effectiveMuted={call!.effectiveMuted ?? call!.isMuted}
          speaking={call!.speaking}
          canToggleMute={call!.canToggleMute ?? true}
          canToggleDeafen={call!.canToggleDeafen ?? true}
          isScreenSharing={call!.isScreenSharing}
          isScreenShareUpdating={call!.isScreenShareUpdating}
          isRemoteScreenLoading={call!.isRemoteScreenLoading}
          isRemoteScreenAvailable={call!.isRemoteScreenAvailable}
          isWatchingRemoteScreen={call!.isWatchingRemoteScreen}
          callIssue={call!.callIssue}
          remoteScreenStream={call!.remoteScreenStream}
          localScreenStream={call!.localScreenStream}
          diagnostics={call!.diagnostics}
          onMuteToggle={call!.toggleMute}
          onDeafenToggle={call!.toggleDeafen ?? (() => undefined)}
          onStartScreenShare={call!.startScreenShare}
          onStopScreenShare={call!.stopScreenShare}
          onWatchRemoteScreen={call!.watchRemoteScreen}
          onHangUp={call!.hangUp}
        />
      )}
      {shouldShowPersistentActiveCallDock && (
        <PersistentActiveCallDock currentUser={currentUser} remoteUser={partner} />
      )}

      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.26),transparent_12%)]"
        data-testid="message-list-region"
        data-presentation={activeChat.type === "channel" ? "server-channel" : "direct-or-room"}
      >
        <MessageList
          key={`${activeChat.type}:${chatId}`}
          messages={messages}
          currentUserId={currentUser.id}
          isLoading={isLoading}
          initialHistoryLoaded={initialHistoryLoaded}
          hasMore={hasMore}
          onLoadMore={loadMore}
          chatContext={chatContext!}
          onReply={setReplyTo}
          onOpenStickerPack={openStickerPreview}
          directedCallHistoryEntries={directedCallHistoryEntries}
          canReact={activeChat.type !== "room" || groupGovernance?.action_capabilities?.send_reactions === true}
        />
      </div>

      {typingNickname && <TypingIndicator nickname={typingNickname} />}

      <MessageInput
        onSend={sendWithGovernance}
        permissions={groupPermissions}
        slowModeUntil={slowModeUntil}
        onOpenPicker={() => setPickerOpen((open) => !open)}
        pickerOpen={pickerOpen}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        focusBlocked={isSearchOpen}
        onRegisterCustomEmojiInserter={(inserter) => { customEmojiInserterRef.current = inserter; }}
      />

      {isSearchOpen && (
        <MessageSearch
          targetId={chatId}
          type={activeChat.type === "direct" ? "direct" : "room"}
          onClose={() => setIsSearchOpen(false)}
          onJumpTo={(id) => console.log("Jump to message:", id)}
        />
      )}
      </div>
      {pickerOpen && <StickerPicker selectionRequest={pickerSelectionRequest} onSelectionHandled={handleSelectionHandled} onClose={() => setPickerOpen(false)} onInsertCustomEmoji={(emoji) => customEmojiInserterRef.current(emoji)} onSend={async (stickerId) => { await sendMessage({ stickerId }); }} onSendGif={async (gif) => { await sendMessage({ gif: { provider: "giphy", provider_id: gif.providerId, width: gif.width, height: gif.height, title: gif.title } }); }} />}
      {stickerPreview && <StickerPackPreviewDialog request={stickerPreview} onClose={closeStickerPreview} onOpenPack={openStickerPack} />}
    </div>
    </>
  );
}
