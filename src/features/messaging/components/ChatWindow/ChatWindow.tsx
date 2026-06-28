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
import type { CallStatus } from "@/features/calling/hooks/useCall.types";
import { cn } from "@/shared/utils/cn";
import { withFallbackRef } from "@/shared/utils/refs";
import {
  getPresenceLabel,
  resolvePresenceStatus,
} from "@/shared/utils/presence";

interface Props {
  activeChat: ActiveChat;
  callStatus: CallStatus;
  onStartCall: (targetUserId: string | number) => void;
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

export function ChatWindow({ activeChat, callStatus, onStartCall }: Props) {
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

  const renderHeader = () => {
    if (activeChat.type === "direct") {
      if (!partner)
        return <div className="p-4 border-b border-border">Loading...</div>;

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
        <div className="flex items-center justify-between border-b border-border p-2">
          <div className="flex items-center gap-2">
            <Avatar
              name={partner.display_name || partner.username}
              src={partner.avatar_url}
              size="medium"
              status={currentStatus as any}
            />
            <div>
              <h3 className="text-sm font-normal">
                {partner.display_name || partner.username}
              </h3>
              <p
                className={cn(
                  "text-[10px]",
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
          <div className="flex items-center gap-2">
            <CallButton
              targetUserId={
                partner?.public_id ??
                activeChat.partnerRef ??
                activeChat.partnerId
              }
              targetUsername={partner.display_name || partner.username}
              status={callStatus}
              onCall={onStartCall}
            />
            <button onClick={() => setIsSearchOpen(true)}>Search</button>
          </div>
        </div>
      );
    } else if (activeChat.type === "room") {
      const roomId = activeChat.roomId;
      const roomPreview = roomPreviews[roomId];
      return (
        <div className="flex items-center justify-between border-b border-border p-2">
          <div className="flex items-center gap-2">
            <Avatar name={roomPreview?.name || `#${roomId}`} size="medium" />
            <div>
              <h3 className="text-sm font-normal">
                {roomPreview?.name || `Room #${roomId}`}
              </h3>
              <p className="text-[10px] text-muted-foreground">Group chat</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSearchOpen(true)}>Search</button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      {renderHeader()}

      <div className="relative flex-1 overflow-hidden p-2">
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
