import { useEffect, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { UserSearch } from "../UserSearch/UserSearch";
import { CreateRoomModal } from "../CreateRoomModal/CreateRoomModal";
import { CreateServerModal } from "../CreateServerModal/CreateServerModal";
import { CreatePickerModal } from "../CreatePickerModal/CreatePickerModal";
import { ProfileModal } from "@/features/profile/components/ProfileModal/ProfileModal";
import { serversApi } from "@/api/servers";
import { formatPreviewTime } from "@/utils/formatDate";
import type { ActiveChat } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { cn } from "@/shared/utils/cn";
import { SquarePen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@radix-ui/react-tooltip";
import { EmojiText } from "@/shared/components/Emoji/Emoji";

interface SidebarProps {
  isServerMode?:  boolean;
}

type SidebarItem =
  | { kind: "direct"; id: number; name: string; time: string; preview: string; unread: number; isOnline: boolean; status?: 'online' | 'away' | 'dnd' | 'offline' | null }
  | { kind: "room";   id: number; name: string; time: string; preview: string; unread: number };

export function Sidebar({ 
  isServerMode = false, 
}: SidebarProps) {
  const currentUser          = useAppStore((s: RootState) => s.currentUser);
  const activeChat           = useAppStore((s: RootState) => s.activeChat);
  const conversationPreviews = useAppStore((s: RootState) => s.conversationPreviews);
  const roomPreviews         = useAppStore((s: RootState) => s.roomPreviews);
  const onlineUserIds        = useAppStore((s: RootState) => s.onlineUserIds);
  const userStatuses         = useAppStore((s: RootState) => s.userStatuses);
  const setActiveChat        = useAppStore((s: RootState) => s.setActiveChat);
  const setServers           = useAppStore((s: RootState) => s.setServers);
  const activeModal          = useAppStore((s: RootState) => s.activeModal);
  const openModal            = useAppStore((s: RootState) => s.openModal);
  const closeModal           = useAppStore((s: RootState) => s.closeModal);

  const [showProfile, setShowProfile] = useState(false);

  const getPreviewText = (content?: string | null, mediaFileId?: string | null) => {
    if (content && content.trim().length > 0) return content;
    if (mediaFileId) return "📎 Attachment";
    return "No messages yet";
  };

  useEffect(() => {
    if (!currentUser) return;
    serversApi
      .getList()
      .then(setServers)
      .catch((err) => console.error("Failed to load servers:", err));
  }, [currentUser, setServers]);

  const directItems: SidebarItem[] = Object.values(conversationPreviews).map((p) => ({
    kind:     "direct",
    id:       p.partner_id,
    name:     p.partner_display_name ?? p.partner_username,
    time:     p.last_message.inserted_at,
    preview:  getPreviewText(p.last_message.content, p.last_message.media_file_id),
    unread:   p.unread_count,
    isOnline: onlineUserIds.has(Number(p.partner_id)),
    status:   userStatuses[Number(p.partner_id)] || "offline",
  }));

  const roomItems: SidebarItem[] = Object.values(roomPreviews)
    .filter((r) => r.server_id == null)
    .map((r) => ({
      kind:    "room",
      id:      r.id,
      name:    r.name,
      time:    r.last_message_at ?? r.inserted_at,
      preview: r.last_message
        ? getPreviewText(r.last_message.content, r.last_message.media_file_id)
        : "No messages yet",
      unread:  r.unread_count,
    }));

  const allItems = [...directItems, ...roomItems].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  const isItemActive = (item: SidebarItem): boolean => {
    if (!activeChat) return false;
    if (item.kind === "direct")
      return activeChat.type === "direct" && activeChat.partnerId === item.id;
    return activeChat.type === "room" && activeChat.roomId === item.id;
  };

  const handleItemClick = (item: SidebarItem) => {
    const next: ActiveChat =
      item.kind === "direct"
        ? { type: "direct", partnerId: item.id }
        : { type: "room",   roomId: item.id };
    setActiveChat(next);
  };

  return (
    <>
      <div className={cn(
        "flex h-full w-[432px] flex-col",
        isServerMode && "w-[72px]"
      )}>
        {/* Search */}
        {!isServerMode && (
          <div className="p-4">
            <UserSearch />
          </div>
        )}

        {/* Messages Header */}
        <div className={cn("flex items-center justify-between px-4 pb-2", isServerMode && "hidden")}>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Messages</span>
          <button
            onClick={() => openModal("CREATE_PICKER")}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Новый чат"
            title="Начать новый чат"
          >
            <SquarePen className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Area */}
        <div dir="ltr" data-slot="scroll-area" className="relative flex-1 overflow-hidden">
          <style>{`[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`}</style>
          <div data-radix-scroll-area-viewport="" data-slot="scroll-area-viewport" className="focus-visible:ring-ring/50 size-full transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1 overflow-y-auto overflow-x-hidden">
            <div className="px-2 space-y-1">
              <TooltipProvider delayDuration={400}>
                {allItems.map((item) => {
                  const isActive = isItemActive(item);
                  
                  return (
                    <Tooltip key={`${item.kind}-${item.id}`}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleItemClick(item)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-sidebar-accent",
                            isActive && "bg-sidebar-accent"
                          )}
                        >
                          <div className="relative">
                            <Avatar 
                              name={item.name} 
                              size="large" 
                              className="size-8 h-10 w-10" 
                              status={item.kind === "direct" ? (item.status || (item.isOnline ? "online" : "offline")) : null}
                            />
                          </div>
                          
                          {!isServerMode && (
                            <div className="flex-1 overflow-hidden">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sidebar-foreground">{item.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatPreviewTime(item.time)}
                                </span>
                              </div>
                              <p className="truncate text-sm text-muted-foreground">
                                <EmojiText text={item.preview} size={14} />
                              </p>
                            </div>
                          )}

                          {!isServerMode && item.unread > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-unread px-1.5 text-xs font-medium text-unread-foreground">
                              {item.unread}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      {isServerMode && (
                        <TooltipContent side="right" className="z-50 bg-popover text-popover-foreground border border-border px-3 py-1.5 rounded-md text-sm shadow-md animate-in fade-in zoom-in-95 duration-100">
                          <p>{item.name}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>

      {activeModal === "CREATE_ROOM" && <CreateRoomModal onClose={closeModal} />}
      {activeModal === "CREATE_SERVER" && <CreateServerModal onClose={closeModal} />}
      {activeModal === "CREATE_PICKER" && (
        <CreatePickerModal
          onClose={closeModal}
          onPickServer={() => openModal("CREATE_SERVER")}
          onPickGroup={() => openModal("CREATE_ROOM")}
        />
      )}
      {showProfile && currentUser && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfile(false)}
        />
      )}
    </>
  );
}
