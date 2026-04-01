import { useEffect, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { UserSearch } from "../UserSearch/UserSearch";
import { CreateRoomModal } from "../CreateRoomModal/CreateRoomModal";
import { CreateServerModal } from "../CreateServerModal/CreateServerModal";
import { CreatePickerModal } from "../CreatePickerModal/CreatePickerModal";
import { ProfileModal } from "@/features/profile/components/ProfileModal/ProfileModal";
import { serversApi } from "@/api/servers";
import { formatPreviewTime } from "@/utils/formatDate";
import { Avatar } from "@/shared/components/Avatar";
import { cn } from "@/shared/utils/cn";
import { EmojiText } from "@/shared/components/Emoji/Emoji";

interface SidebarProps {
  isServerMode?: boolean;
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
  const servers              = useAppStore((s: RootState) => s.servers);
  const setServers           = useAppStore((s: RootState) => s.setServers);
  const activeModal          = useAppStore((s: RootState) => s.activeModal);
  const openModal            = useAppStore((s: RootState) => s.openModal);
  const closeModal           = useAppStore((s: RootState) => s.closeModal);

  const [showProfile, setShowProfile] = useState(false);

  const getPreviewText = (content?: string | null, mediaFileId?: string | null) => {
    if (content && content.trim().length > 0) return content;
    if (mediaFileId) return "Attachment";
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

  const serverList = Object.values(servers);

  const isItemActive = (item: SidebarItem): boolean => {
    if (!activeChat) return false;
    if (item.kind === "direct")
      return activeChat.type === "direct" && activeChat.partnerId === item.id;
    return activeChat.type === "room" && activeChat.roomId === item.id;
  };

  const handleItemClick = (item: SidebarItem) => {
    if (item.kind === "direct") {
      window.location.hash = `/${item.id}`;
    } else {
      window.location.hash = `/r/${item.id}`;
    }
  };

  return (
    <div className={cn("flex h-full w-full flex-col", isServerMode && "w-[60px]")}>
      {!isServerMode && (
        <div className="p-2 border-b border-border">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-normal">Messages</h1>
            <button onClick={() => openModal("CREATE_PICKER")}>New</button>
          </div>
          <UserSearch />
        </div>
      )}

      {!isServerMode && serverList.length > 0 && (
        <div className="p-2 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs uppercase text-muted-foreground">Servers</span>
            <button onClick={() => openModal("CREATE_SERVER")}>+</button>
          </div>
          <div className="space-y-1">
            {serverList.map((server) => (
              <button
                key={server.id}
                onClick={() => { window.location.hash = `/s/${server.id}`; }}
                className="flex w-full items-center gap-2 p-1 text-left"
              >
                <Avatar name={server.name} size="small" />
                <span className="truncate text-sm">{server.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1 space-y-1">
        {allItems.map((item) => {
          const isActive = isItemActive(item);
          return (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => handleItemClick(item)}
              className={cn(
                "flex w-full items-center gap-2 p-2 text-left border border-transparent",
                isActive && "border-border bg-card"
              )}
            >
              <Avatar
                name={item.name}
                size="medium"
                status={item.kind === "direct" ? (item.status || (item.isOnline ? "online" : "offline")) : null}
              />
              {!isServerMode && (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{item.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatPreviewTime(item.time)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    <EmojiText text={item.preview} size={12} />
                  </p>
                </div>
              )}
              {!isServerMode && item.unread > 0 && (
                <span className="bg-primary text-primary-foreground px-1 text-[10px]">
                  {item.unread}
                </span>
              )}
            </button>
          );
        })}
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
    </div>
  );
}
