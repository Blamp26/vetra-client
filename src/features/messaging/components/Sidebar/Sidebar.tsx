import { useEffect, useState } from "react";
import { useAppStore, type RootState } from "@/store";
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

  const renderItem = (item: SidebarItem) => {
    const active = isItemActive(item);
    const isDirect = item.kind === "direct";
    const status = isDirect ? (userStatuses[item.id] || (item.isOnline ? 'online' : 'offline')) : null;

    return (
      <div
        key={`${item.kind}-${item.id}`}
        onClick={() => handleItemClick(item)}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl cursor-pointer transition-all duration-200 select-none",
          active 
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <Avatar 
          name={item.name} 
          size="medium"
          status={status as any}
          className={cn(active ? "bg-primary-foreground text-primary" : "")}
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className={cn(
              "text-sm font-semibold truncate",
              active ? "text-primary-foreground" : "text-foreground group-hover:text-accent-foreground"
            )}>
              {item.name}
            </span>
            <span className={cn(
              "text-[10px] whitespace-nowrap",
              active ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {formatPreviewTime(item.time)}
            </span>
          </div>
          
          <div className="flex items-center justify-between gap-2">
            <p className={cn(
              "text-xs truncate leading-tight",
              active ? "text-primary-foreground/80" : "text-muted-foreground"
            )}>
              {item.preview}
            </p>
            {item.unread > 0 && (
              <span className={cn(
                "flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2 ring-sidebar",
                active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
              )}>
                {item.unread > 99 ? "99+" : item.unread}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={cn(
        "flex h-full flex-col bg-sidebar border-r border-border transition-all duration-300 ease-in-out",
        isServerMode ? "w-[300px]" : "w-[300px]"
      )}>
        {/* Header */}
        <div className="p-4 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Чаты</h2>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                     onClick={() => openModal("CREATE_PICKER")}
                     className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                   >
                    <SquarePen className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-50 overflow-hidden rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in zoom-in-95 duration-100">
                  Новый чат
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 scrollbar-hide">
          {allItems.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">Нет активных чатов</p>
            </div>
          ) : (
            allItems.map(renderItem)
          )}
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
