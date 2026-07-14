import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  useUnifiedMessages,
  type ChatContext,
} from "@/features/messaging/hooks/useUnifiedMessages";
import { useAppStore, type RootState } from "@/store";
import { authApi } from "@/api/auth";
import { MessageList } from "../MessageList/MessageList";
import { MessageInput } from "../MessageInput/MessageInput";
import { MessageSearch } from "../MessageSearch/MessageSearch";
import { StickerPicker } from "../StickerPicker/StickerPicker";
import { StickerPackPreviewDialog, type StickerPackSelectionRequest } from "../StickerPicker/StickerPackPreviewDialog";
import type { ActiveChat, StickerMessage, User } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { CallButton } from "@/features/calling/components/CallButton";
import { ActiveCallDock } from "@/features/calling/components/ActiveCallDock";
import type { UseCallReturn } from "@/features/calling/hooks/useCall.types";
import { normalizeCallIssue } from "@/features/calling/utils/callUxText";
import { cn } from "@/shared/utils/cn";
import { withFallbackRef } from "@/shared/utils/refs";
import {
  getPresenceText,
  resolvePresenceStatus,
} from "@/shared/utils/presence";
import { Search } from "lucide-react";

interface Props {
  activeChat: ActiveChat;
  call: UseCallReturn;
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
  call: UseCallReturn,
  conversationPreviews: RootState["conversationPreviews"],
): boolean {
  if (call.status !== "active") return false;
  if (activeChat.type !== "direct") return false;
  if (call.remoteUserId === null || call.remoteUserId === undefined) return false;

  const callRemoteId = String(call.remoteUserId);
  return (
    callRemoteId === String(activeChat.partnerId) ||
    (activeChat.partnerRef !== undefined && callRemoteId === String(activeChat.partnerRef)) ||
    callRemoteId === String(conversationPreviews[activeChat.partnerId]?.partner_public_id ?? "")
  );
}

export function ChatWindow({ activeChat, call }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const socketManager = useAppStore((s: RootState) => s.socketManager);

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

  const [partner, setPartner] = useState<User | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [callStartIssue, setCallStartIssue] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stickerPreview, setStickerPreview] = useState<StickerPackSelectionRequest | null>(null);
  const [pickerSelectionRequest, setPickerSelectionRequest] = useState<StickerPackSelectionRequest | null>(null);
  const stickerRequestRevision = useRef(0);
  const stickerTriggerRef = useRef<HTMLElement | null>(null);
  const customEmojiInserterRef = useRef<(emoji: StickerMessage) => void>(() => undefined);
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
    return null;
  }, [activePartnerId, activePartnerRef, activeRoomId, activeRoomRef]);

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

  const chatId =
    activeChat.type === "direct"
      ? activeChat.partnerId
      : activeChat.type === "room"
        ? activeChat.roomId
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
  }, [activeChatType, activePartnerId, directPartnerRef]);

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
      call.startCall(targetUserId, targetUsername);
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
  const displayCallIssue = normalizeCallIssue(call.callIssue);

  const renderHeader = () => {
    if (activeChat.type === "direct") {
      if (!partner)
        return (
          <div
            className="flex h-[54px] items-center border-b border-border px-4 text-sm text-muted-foreground"
            data-testid="chat-header"
          >
            Loading...
          </div>
        );

      const resolvedLastSeenAt =
        lastSeenAt[activeChat.partnerId] ?? partner.last_seen_at;
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

      return (
        <div
          className="flex h-[54px] items-center justify-between border-b border-border px-4"
          data-testid="chat-header"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
            <Avatar
              name={partner.display_name || partner.username}
              src={partner.avatar_url}
              size="medium"
              status={currentStatus as any}
            />
            <div className="flex min-w-0 flex-col justify-center self-stretch pt-2">
              <h3 className="truncate text-[15px] font-semibold leading-5">
                {partner.display_name || partner.username}
              </h3>
              <p
                data-testid="chat-header-status"
                className={cn(
                  "mt-[4px] truncate text-[12px] leading-[14px]",
                  currentStatus === "online"
                    ? "text-online"
                    : currentStatus === "away"
                      ? "text-away"
                      : currentStatus === "dnd"
                        ? "text-busy"
                        : "text-muted-foreground",
                )}
              >
              {statusLine}
              </p>
            </div>
          </div>
          <div className="flex h-full shrink-0 items-center" data-testid="chat-header-actions">
            <CallButton
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
            />
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search"
              className="flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-0"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      );
    } else if (activeChat.type === "room") {
      const roomId = activeChat.roomId;
      const roomPreview = roomPreviews[roomId];
      return (
        <div
          className="flex h-[54px] items-center justify-between border-b border-border px-4"
          data-testid="chat-header"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
            <Avatar name={roomPreview?.name || `#${roomId}`} size="medium" />
            <div className="flex min-w-0 flex-col justify-center self-stretch pt-2">
              <h3 className="truncate text-[15px] font-semibold leading-5">
                {roomPreview?.name || `Room #${roomId}`}
              </h3>
              <p className="mt-[4px] truncate text-[12px] leading-[14px] text-muted-foreground">Group chat</p>
            </div>
          </div>
          <div className="flex h-full shrink-0 items-center" data-testid="chat-header-actions">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search"
              className="flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-0"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-[var(--vetra-shell-chat-bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {renderHeader()}

      {(callStartIssue || (call.status === "idle" && displayCallIssue?.message)) && (
        <div
          className="border-b border-destructive/40 bg-destructive/10 px-5 py-2 text-sm text-foreground"
          data-testid="call-start-issue"
        >
          {callStartIssue ?? displayCallIssue?.message}
        </div>
      )}

      {shouldShowActiveCallDock && (
        <ActiveCallDock
          remoteUsername={call.remoteUsername ?? `User #${call.remoteUserId}`}
          callStatus={call.status}
          seconds={call.seconds}
          isMuted={call.isMuted}
          isScreenSharing={call.isScreenSharing}
          isScreenShareUpdating={call.isScreenShareUpdating}
          isRemoteScreenLoading={call.isRemoteScreenLoading}
          callIssue={call.callIssue}
          remoteScreenStream={call.remoteScreenStream}
          localScreenStream={call.localScreenStream}
          diagnostics={call.diagnostics}
          onMuteToggle={call.toggleMute}
          onStartScreenShare={call.startScreenShare}
          onStopScreenShare={call.stopScreenShare}
          onHangUp={call.hangUp}
        />
      )}

      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.26),transparent_12%)]"
        data-testid="message-list-region"
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
        />
      </div>

      {typingNickname && <TypingIndicator nickname={typingNickname} />}

      <MessageInput
        onSend={sendMessage}
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
  );
}
