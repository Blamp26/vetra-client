import { useEffect, useState, useCallback } from "react";
import { useMessages } from "@/features/messaging/hooks/useMessages";
import { useRoomMessages } from "@/features/messaging/hooks/useRoomMessages";
import { useAppStore, type RootState } from "@/store";
import { authApi } from "@/api/auth";
import { MessageList } from "../MessageList/MessageList";
import { MessageInput } from "../MessageInput/MessageInput";
import { formatLastSeen } from "@/utils/formatDate";
import type { ActiveChat, Message, User } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { CallButton } from '@/features/calling/components/CallButton';
import type { CallStatus } from '@/features/calling/hooks/useCall.types';
import { cn } from "@/shared/utils/cn";

interface Props {
  activeChat: ActiveChat;
  callStatus: CallStatus;
  onStartCall: (targetUserId: number) => void;
}

interface ReplyTarget {
  id:      number;
  content: string;
  author:  string;
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator({ nickname }: { nickname: string }) {
  return (
    <div className="flex items-center px-5 py-1 pb-1.5 text-[0.80rem] text-[#7A7A7A] min-h-[24px] flex-shrink-0">
      <span className="font-semibold text-[#4A4A4A]">{nickname}</span>
      <span className="ml-0.5"> is typing</span>
      <span className="inline-flex items-center gap-[3px] ml-1">
        <span className="w-[5px] h-[5px] rounded-full bg-[#7A7A7A] animate-bounce" />
        <span className="w-[5px] h-[5px] rounded-full bg-[#7A7A7A] animate-bounce [animation-delay:0.2s]" />
        <span className="w-[5px] h-[5px] rounded-full bg-[#7A7A7A] animate-bounce [animation-delay:0.4s]" />
      </span>
    </div>
  );
}

// ── Shared layout ─────────────────────────────────────────────────────────────

interface LayoutProps {
  chatId:         number;
  currentUserId:  number;
  header:         React.ReactNode;
  messages:       Message[];
  isLoading:      boolean;
  hasMore:        boolean;
  loadMore:       () => void;
  sendMessage:    (payload: { content?: string | null; mediaFileId?: string | null }) => Promise<void>;
  typingNickname: string | null;
  chatContext:
    | { type: "direct"; partnerId: number }
    | { type: "room";   roomId: number };
  onTypingStart?: () => void;
  onTypingStop?:  () => void;
  onReplySelect?: (target: ReplyTarget) => void;
}

function ChatWindowLayout({
  chatId,
  currentUserId,
  header,
  messages,
  isLoading,
  hasMore,
  loadMore,
  sendMessage,
  typingNickname,
  chatContext,
  onTypingStart,
  onTypingStop,
  onReplySelect,
}: LayoutProps) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  useEffect(() => {
    setReplyTo(null);
  }, [chatId]);

  const handleReplySelect = (target: ReplyTarget) => {
    setReplyTo(target);
    onReplySelect?.(target);
  };

  const handleCancelReply = () => {
    setReplyTo(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <header className="px-5 py-2.5 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2.5">{header}</div>
      </header>

      <MessageList
        key={chatId}
        messages={messages}
        currentUserId={currentUserId}
        isLoading={isLoading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        chatContext={chatContext}
        onReply={handleReplySelect}
      />


      {typingNickname && <TypingIndicator nickname={typingNickname} />}

      <MessageInput
        onSend={sendMessage}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
        replyTo={replyTo}
        onCancelReply={handleCancelReply}
      />
    </div>
  );
}

// ── Личный чат ────────────────────────────────────────────────────────────────

interface DirectChatProps {
  partnerId: number;
  callStatus: CallStatus;
  onStartCall: (targetUserId: number) => void;
}

function DirectChatWindow({ partnerId, callStatus, onStartCall }: DirectChatProps) {
  const currentUser      = useAppStore((s: RootState) => s.currentUser);
  const onlineUserIds    = useAppStore((s: RootState) => s.onlineUserIds);
  const lastSeenAt       = useAppStore((s: RootState) => s.lastSeenAt);
  const typingPartnerIds = useAppStore((s: RootState) => s.typingPartnerIds);
  const socketManager    = useAppStore((s: RootState) => s.socketManager);

  const [partner, setPartner] = useState<User | null>(null);
  const { messages, isLoading, hasMore, loadMore, sendMessage } =
    useMessages(partnerId);

  const isOnline = onlineUserIds.has(partnerId);
  const isTyping = typingPartnerIds.has(partnerId);

  useEffect(() => {
    let cancelled = false;
    authApi.getUser(partnerId).then((user: User) => {
      if (!cancelled) setPartner(user);
    });
    return () => { cancelled = true; };
  }, [partnerId]);

  const handleTypingStart = useCallback(() => {
    socketManager?.sendTypingStart(partnerId);
  }, [socketManager, partnerId]);

  const handleTypingStop = useCallback(() => {
    socketManager?.sendTypingStop(partnerId);
  }, [socketManager, partnerId]);

  if (!currentUser) return null;

  const statusLine = (() => {
    if (isOnline) return "online";
    const storeLastSeen = lastSeenAt[partnerId];
    if (storeLastSeen)         return formatLastSeen(storeLastSeen);
    if (partner?.last_seen_at) return formatLastSeen(partner.last_seen_at);
    return null;
  })();

  const header = partner ? (
    <>
      <div className="relative">
        <Avatar 
          name={partner.display_name || partner.username} 
          src={partner.avatar_url} 
          size="large" 
        />
        {isOnline && <span className="absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2 border-white bg-[#2ecc71] bottom-[-2px] right-[-2px]" />}
      </div>
      <div className="flex flex-col">
        <span className="text-[0.95rem] font-semibold">
          {partner.display_name || partner.username}
        </span>
        {statusLine && (
          <span
            className={cn(
              "text-[0.72rem] text-[#7A7A7A]",
              isOnline && "text-[#2ecc71]"
            )}
          >
            {statusLine}
          </span>
        )}
      </div>

      <CallButton
        targetUserId={partnerId}
        targetUsername={partner.display_name || partner.username}
        status={callStatus}
        onCall={onStartCall}
      />
    </>
  ) : (
    <span className="text-[#7A7A7A] text-[0.9rem]">Loading…</span>
  );

  return (
    <>
      <ChatWindowLayout
        chatId={partnerId}
        currentUserId={currentUser.id}
        header={header}
        messages={messages}
        isLoading={isLoading}
        hasMore={hasMore}
        loadMore={loadMore}
        sendMessage={sendMessage}
        typingNickname={
          isTyping && partner
            ? (partner.display_name || partner.username)
            : null
        }
        chatContext={{ type: "direct", partnerId }}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
      />
    </>
  );
}

// ── Групповой чат ─────────────────────────────────────────────────────────────

function RoomChatWindow({ roomId }: { roomId: number }) {
  const currentUser         = useAppStore((s: RootState) => s.currentUser);
  const roomPreviews        = useAppStore((s: RootState) => s.roomPreviews);
  const typingRoomMemberIds = useAppStore((s: RootState) => s.typingRoomMemberIds);
  const typingRoomMemberInfo = useAppStore((s: RootState) => s.typingRoomMemberInfo);
  const socketManager       = useAppStore((s: RootState) => s.socketManager);

  const { messages, isLoading, hasMore, loadMore, sendMessage } =
    useRoomMessages(roomId);

  const roomPreview = roomPreviews[roomId];

  const handleTypingStart = useCallback(() => {
    socketManager?.sendRoomTypingStart(roomId);
  }, [socketManager, roomId]);

  const handleTypingStop = useCallback(() => {
    socketManager?.sendRoomTypingStop(roomId);
  }, [socketManager, roomId]);

  if (!currentUser) return null;

  const typingNickname: string | null = (() => {
    const otherId = Array.from(typingRoomMemberIds).find(
      (id) => id !== currentUser.id
    );
    if (otherId === undefined) return null;
    const info = typingRoomMemberInfo[otherId];
    if (info) {
      return info.display_name || info.username;
    }
    return `User #${otherId}`;
  })();

  const header = (
    <>
      <div className="relative">
        <Avatar name="#" size="large" className="bg-[#6c5ce7] font-bold text-[1rem]" />
      </div>
      <div className="flex flex-col">
        <span className="text-[0.95rem] font-semibold">
          {roomPreview?.name ?? `Room #${roomId}`}
        </span>
        <span className="text-[0.72rem] text-[#7A7A7A]">Group chat</span>
      </div>
    </>
  );

  return (
    <ChatWindowLayout
      chatId={roomId}
      currentUserId={currentUser.id}
      header={header}
      messages={messages}
      isLoading={isLoading}
      hasMore={hasMore}
      loadMore={loadMore}
      sendMessage={sendMessage}
      typingNickname={typingNickname}
      chatContext={{ type: "room", roomId }}
      onTypingStart={handleTypingStart}
      onTypingStop={handleTypingStop}
    />
  );
}

// ── Экспортируемый компонент ──────────────────────────────────────────────────

export function ChatWindow({ activeChat, callStatus, onStartCall }: Props) {
  if (activeChat.type === "direct") {
    return (
      <DirectChatWindow 
        partnerId={activeChat.partnerId} 
        callStatus={callStatus}
        onStartCall={onStartCall}
      />
    );
  }
  if (activeChat.type === "room") {
    return <RoomChatWindow roomId={activeChat.roomId} />;
  }
  return null;
}
