import { useEffect, useState, useCallback, useMemo } from "react";
import {
  useUnifiedMessages,
  type ChatContext,
} from "@/features/messaging/hooks/useUnifiedMessages";
import { useAppStore, type RootState } from "@/store";
import { authApi } from "@/api/auth";
import { MessageList } from "../MessageList/MessageList";
import { MessageInput } from "../MessageInput/MessageInput";
import { MessageSearch } from "../MessageSearch/MessageSearch";
import { formatLastSeen } from "@/utils/formatDate";
import type { ActiveChat, User } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { CallButton } from "@/features/calling/components/CallButton";
import { ActiveCallDock } from "@/features/calling/components/ActiveCallDock";
import type { UseCallReturn } from "@/features/calling/hooks/useCall.types";
import { normalizeCallIssue } from "@/features/calling/utils/callUxText";
import { cn } from "@/shared/utils/cn";
import { withFallbackRef } from "@/shared/utils/refs";
import {
  getPresenceLabel,
  resolvePresenceStatus,
} from "@/shared/utils/presence";

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
    <div className="px-4 py-1 text-xs text-muted-foreground border-t border-border">
      <span className="font-normal">{nickname}</span>
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

  const { messages, isLoading, hasMore, loadMore, sendMessage } =
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
        });
      return () => {
        cancelled = true;
      };
    } else {
      setPartner(null);
    }
  }, [activeChatType, activePartnerId, directPartnerRef]);

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
            className="flex min-h-14 items-center border-b border-border px-4 py-2 text-sm text-muted-foreground"
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

      const statusLine = (() => {
        if (currentStatus !== "offline") {
          return getPresenceLabel(currentStatus);
        }
        if (resolvedLastSeenAt) return formatLastSeen(resolvedLastSeenAt);
        return "Offline";
      })();

      return (
        <div
          className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-2"
          data-testid="chat-header"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              name={partner.display_name || partner.username}
              src={partner.avatar_url}
              size="medium"
              status={currentStatus as any}
            />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium leading-5">
                {partner.display_name || partner.username}
              </h3>
              <p
                className={cn(
                  "truncate text-xs leading-4",
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
          <div className="flex shrink-0 items-center gap-2" data-testid="chat-header-actions">
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
              className="border border-border bg-card hover:bg-accent"
            />
            <button
              onClick={() => setIsSearchOpen(true)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Search
            </button>
          </div>
        </div>
      );
    } else if (activeChat.type === "room") {
      const roomId = activeChat.roomId;
      const roomPreview = roomPreviews[roomId];
      return (
        <div
          className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-2"
          data-testid="chat-header"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={roomPreview?.name || `#${roomId}`} size="medium" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium leading-5">
                {roomPreview?.name || `Room #${roomId}`}
              </h3>
              <p className="truncate text-xs leading-4 text-muted-foreground">Group chat</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2" data-testid="chat-header-actions">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Search
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      {renderHeader()}

      {(callStartIssue || (call.status === "idle" && displayCallIssue?.message)) && (
        <div
          className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-foreground"
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

      <div className="relative min-h-0 flex-1 overflow-hidden p-2" data-testid="message-list-region">
        <MessageList
          key={chatId}
          messages={messages}
          currentUserId={currentUser.id}
          isLoading={isLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          chatContext={chatContext!}
          onReply={setReplyTo}
        />
      </div>

      {typingNickname && <TypingIndicator nickname={typingNickname} />}

      <MessageInput
        onSend={sendMessage}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
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
  );
}
