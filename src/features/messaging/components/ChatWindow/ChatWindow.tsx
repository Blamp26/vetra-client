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
import { Video, EllipsisVertical } from "lucide-react";

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
    <div className="flex items-center px-6 py-1 pb-2 text-[0.80rem] text-muted-foreground min-h-[24px] flex-shrink-0">
      <span className="font-semibold text-foreground">{nickname}</span>
      <span className="ml-1">печатает</span>
      <span className="inline-flex items-center gap-[3px] ml-1.5">
        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" />
        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.4s]" />
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
    <div className="flex flex-1 flex-col bg-background h-full overflow-hidden">
      {header}

      <div dir="ltr" data-slot="scroll-area" className="relative flex-1 pl-6 overflow-hidden">
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
      </div>

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
    if (isOnline) return "Online";
    const storeLastSeen = lastSeenAt[partnerId];
    if (storeLastSeen)         return formatLastSeen(storeLastSeen);
    if (partner?.last_seen_at) return formatLastSeen(partner.last_seen_at);
    return null;
  })();

  const header = partner ? (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar 
            name={partner.display_name || partner.username} 
            src={partner.avatar_url} 
            size="large"
            className="h-10 w-10"
          />
          {isOnline && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />}
        </div>
        <div>
          <h3 className="font-medium text-foreground">
            {partner.display_name || partner.username}
          </h3>
          <p className={cn("text-xs text-muted-foreground", isOnline && "text-emerald-500")}>
            {statusLine}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <CallButton
          targetUserId={partnerId}
          targetUsername={partner.display_name || partner.username}
          status={callStatus}
          onCall={onStartCall}
        />
        <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all hover:bg-accent hover:text-foreground size-9 h-9 w-9 text-muted-foreground">
          <Video className="h-4 w-4" />
        </button>
        <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all hover:bg-accent hover:text-foreground size-9 h-9 w-9 text-muted-foreground">
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <span className="text-muted-foreground text-[0.9rem]">Загрузка…</span>
    </div>
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

  const header = (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-3">
        <Avatar 
          name={roomPreview?.name || `#${roomId}`} 
          src={null} 
          size="large"
          className="h-10 w-10"
        />
        <div>
          <h3 className="font-medium text-foreground">
            {roomPreview?.name || `Room #${roomId}`}
          </h3>
          <p className="text-xs text-muted-foreground">
            Групповой чат
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all hover:bg-accent hover:text-foreground size-9 h-9 w-9 text-muted-foreground">
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const typingMemberNames: string[] = [];
  typingRoomMemberIds.forEach((id: number) => {
    const info = typingRoomMemberInfo[id];
    typingMemberNames.push(info?.display_name || info?.username || `User #${id}`);
  });

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
      typingNickname={
        typingMemberNames.length > 0
          ? typingMemberNames.join(", ")
          : null
      }
      chatContext={{ type: "room", roomId }}
      onTypingStart={handleTypingStart}
      onTypingStop={handleTypingStop}
    />
  );}

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
