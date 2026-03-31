import { useEffect, useState, useCallback, useMemo } from "react";
import { useUnifiedMessages, type ChatContext } from "@/features/messaging/hooks/useUnifiedMessages";
import { useAppStore, type RootState } from "@/store";
import { authApi } from "@/api/auth";
import { MessageList } from "../MessageList/MessageList";
import { MessageInput } from "../MessageInput/MessageInput";
import { MessageSearch } from "../MessageSearch/MessageSearch";
import { formatLastSeen } from "@/utils/formatDate";
import type { ActiveChat, User } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { CallButton } from '@/features/calling/components/CallButton';
import type { CallStatus } from '@/features/calling/hooks/useCall.types';
import { cn } from "@/shared/utils/cn";
import { Video, EllipsisVertical, Search } from "lucide-react";

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
    <div className="flex min-h-[40px] flex-shrink-0 items-center px-6 pb-2 pt-1 max-[1300px]:px-6 z-10">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/5 dark:border-white/10 bg-card/60 backdrop-blur-xl px-3.5 py-1.5 text-xs text-muted-foreground shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] ring-1 ring-inset ring-black/5 dark:ring-white/5 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
        <span className="font-semibold text-foreground tracking-tight">{nickname}</span>
        <span className="opacity-80">печатает</span>
        <span className="ml-0.5 inline-flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-primary/80 animate-bounce" />
          <span className="h-1 w-1 rounded-full bg-primary/80 animate-bounce [animation-delay:0.2s]" />
          <span className="h-1 w-1 rounded-full bg-primary/80 animate-bounce [animation-delay:0.4s]" />
        </span>
      </div>
    </div>
  );
}

// ── Unified Chat Window ───────────────────────────────────────────────────────

export function ChatWindow({ activeChat, callStatus, onStartCall }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const socketManager = useAppStore((s: RootState) => s.socketManager);
  
  // Direct chat state
  const onlineUserIds = useAppStore((s: RootState) => s.onlineUserIds);
  const userStatuses = useAppStore((s: RootState) => s.userStatuses);
  const lastSeenAt = useAppStore((s: RootState) => s.lastSeenAt);
  const typingPartnerIds = useAppStore((s: RootState) => s.typingPartnerIds);
  
  // Room chat state
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);
  const typingRoomMemberIds = useAppStore((s: RootState) => s.typingRoomMemberIds);
  const typingRoomMemberInfo = useAppStore((s: RootState) => s.typingRoomMemberInfo);

  const [partner, setPartner] = useState<User | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  const chatContext = useMemo((): ChatContext | null => {
    if (activeChat.type === "direct") return { type: "direct", partnerId: activeChat.partnerId };
    if (activeChat.type === "room") return { type: "room", roomId: activeChat.roomId };
    return null;
  }, [activeChat]);

  const { messages, isLoading, hasMore, loadMore, sendMessage } = useUnifiedMessages(chatContext);

  const chatId = activeChat.type === "direct" 
    ? activeChat.partnerId 
    : (activeChat.type === "room" ? activeChat.roomId : 0);

  useEffect(() => {
    setReplyTo(null);
    setIsSearchOpen(false);
    if (activeChat.type === "direct") {
      let cancelled = false;
      authApi.getUser(activeChat.partnerId).then((user: User) => {
        if (!cancelled) setPartner(user);
      });
      return () => { cancelled = true; };
    } else {
      setPartner(null);
    }
  }, [activeChat]);

  const handleTypingStart = useCallback(() => {
    if (!socketManager || !chatContext) return;
    if (chatContext.type === "direct") {
      socketManager.sendTypingStart(chatContext.partnerId);
    } else {
      socketManager.sendRoomTypingStart(chatContext.roomId);
    }
  }, [socketManager, chatContext]);

  const handleTypingStop = useCallback(() => {
    if (!socketManager || !chatContext) return;
    if (chatContext.type === "direct") {
      socketManager.sendTypingStop(chatContext.partnerId);
    } else {
      socketManager.sendRoomTypingStop(chatContext.roomId);
    }
  }, [socketManager, chatContext]);

  const typingNickname = useMemo(() => {
    if (activeChat.type === "direct") {
      return typingPartnerIds.has(activeChat.partnerId) && partner
        ? (partner.display_name || partner.username)
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
  }, [activeChat, typingPartnerIds, partner, typingRoomMemberIds, typingRoomMemberInfo]);

  if (!currentUser) return null;

  const renderHeader = () => {
    if (activeChat.type === "direct") {
      if (!partner) return (
        <div className="flex z-20 items-center justify-between border-b border-border/40 bg-background/60 px-6 py-4 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.03)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.02)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-[1.25rem] bg-muted/50" />
            <div className="space-y-2">
              <div className="h-3 w-28 animate-pulse rounded-full bg-muted/50" />
              <div className="h-2.5 w-16 animate-pulse rounded-full bg-muted/50" />
            </div>
          </div>
        </div>
      );

      const isOnline = onlineUserIds.has(activeChat.partnerId);
      const currentStatus = userStatuses[activeChat.partnerId] || partner.status || (isOnline ? "online" : "offline");
      
      const statusLine = (() => {
        if (isOnline) {
          const statusMap: Record<string, string> = {
            online: "Online",
            away: "Away",
            dnd: "Do Not Disturb",
            offline: "Offline"
          };
          return statusMap[currentStatus] || "Online";
        }
        const storeLastSeen = lastSeenAt[activeChat.partnerId];
        if (storeLastSeen) return formatLastSeen(storeLastSeen);
        if (partner.last_seen_at) return formatLastSeen(partner.last_seen_at);
        return "Offline";
      })();

      return (
        <div className="flex z-20 items-center justify-between border-b border-border/40 bg-background/60 pl-6 py-4 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.03)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.02)] max-[1300px]:px-6">
          <div className="flex items-center gap-3">
            <Avatar 
              name={partner.display_name || partner.username} 
              src={partner.avatar_url} 
              size="large"
              className="h-10 w-10 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.35)]"
              status={currentStatus as any}
            />
            <div className="space-y-1">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {partner.display_name || partner.username}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn(
                  "text-xs font-medium transition-colors", 
                  currentStatus === "online" ? "text-online" :
                  currentStatus === "away" ? "text-away" :
                  currentStatus === "dnd" ? "text-busy" :
                  "text-muted-foreground"
                )}>
                  {statusLine}
                </p>
                <span className="rounded-full border border-border/70 bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  Direct message
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <CallButton
              targetUserId={activeChat.partnerId}
              targetUsername={partner.display_name || partner.username}
              status={callStatus}
              onCall={onStartCall}
            />
            <HeaderActions onSearchClick={() => setIsSearchOpen(true)} />
          </div>
        </div>
      );
    } else if (activeChat.type === "room") {
      const roomId = activeChat.roomId;
      const roomPreview = roomPreviews[roomId];
      return (
        <div className="flex z-20 items-center justify-between border-b border-border/40 bg-background/60 pl-6 py-4 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.03)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.02)] max-[1300px]:px-6">
          <div className="flex items-center gap-3">
            <Avatar 
              name={roomPreview?.name || `#${roomId}`} 
              src={null} 
              size="large"
              className="h-10 w-10 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.35)]"
            />
            <div className="space-y-1">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {roomPreview?.name || `Room #${roomId}`}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">Group chat</p>
                <span className="rounded-full border border-border/70 bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  Shared room
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <HeaderActions onSearchClick={() => setIsSearchOpen(true)} />
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background/50 relative">
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] dark:opacity-[0.02] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
      {renderHeader()}

      <div dir="ltr" className="relative flex-1 overflow-hidden pl-6 max-[1300px]:px-6">
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

function HeaderActions({ onSearchClick }: { onSearchClick: () => void }) {
  return (
    <>
      <button 
        className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-xl text-sm font-medium text-muted-foreground transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-card hover:text-foreground active:translate-y-0 active:scale-95 hover:shadow-sm ring-1 ring-inset ring-transparent hover:ring-border/50"
        onClick={onSearchClick}
        title="Поиск сообщений"
      >
        <Search className="h-4 w-4" />
      </button>
      <button className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-xl text-sm font-medium text-muted-foreground transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-card hover:text-foreground active:translate-y-0 active:scale-95 hover:shadow-sm ring-1 ring-inset ring-transparent hover:ring-border/50">
        <Video className="h-4 w-4" />
      </button>
      <button className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-xl text-sm font-medium text-muted-foreground transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-card hover:text-foreground active:translate-y-0 active:scale-95 hover:shadow-sm ring-1 ring-inset ring-transparent hover:ring-border/50">
        <EllipsisVertical className="h-4 w-4" />
      </button>
    </>
  );
}
