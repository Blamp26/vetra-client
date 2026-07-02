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
import {
  roomChatForPreview,
  serverChatForServer,
} from "@/shared/utils/chatRoutes";
import { getPresenceText, resolvePresenceStatus } from "@/shared/utils/presence";
import { getPreviewText } from "../../utils/attachments";

interface SidebarProps {
  isServerMode?: boolean;
}

type SidebarItem =
  | {
      kind: "direct";
      id: number;
      name: string;
      time: string;
      preview: string;
      unread: number;
      isOnline: boolean;
      status?: "online" | "away" | "dnd" | "offline" | null;
      presenceText?: string;
    }
  | {
      kind: "room";
      id: number;
      name: string;
      time: string;
      preview: string;
      unread: number;
    };

export function Sidebar({ isServerMode = false }: SidebarProps) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const activeChat = useAppStore((s: RootState) => s.activeChat);
  const conversationPreviews = useAppStore(
    (s: RootState) => s.conversationPreviews,
  );
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);
  const onlineUserIds = useAppStore((s: RootState) => s.onlineUserIds);
  const userStatuses = useAppStore((s: RootState) => s.userStatuses);
  const lastSeenAt = useAppStore((s: RootState) => s.lastSeenAt);
  const servers = useAppStore((s: RootState) => s.servers);
  const setServers = useAppStore((s: RootState) => s.setServers);
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);
  const activeModal = useAppStore((s: RootState) => s.activeModal);
  const openModal = useAppStore((s: RootState) => s.openModal);
  const closeModal = useAppStore((s: RootState) => s.closeModal);

  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    serversApi
      .getList()
      .then(setServers)
      .catch((err) => console.error("Failed to load servers:", err));
  }, [currentUser, setServers]);

  const directItems: SidebarItem[] = Object.values(conversationPreviews).map((p) => {
    const partnerId = Number(p.partner_id);
    const status = resolvePresenceStatus({
      userId: partnerId,
      onlineUserIds,
      userStatuses,
      lastSeenAt: lastSeenAt[partnerId],
    });

    return {
      kind: "direct",
      id: p.partner_id,
      name: p.partner_display_name ?? p.partner_username,
      time: p.last_message.inserted_at,
      preview: getPreviewText(p.last_message, "No messages yet"),
      unread: p.unread_count,
      isOnline: onlineUserIds.has(partnerId),
      status,
      presenceText: getPresenceText({
        status,
        lastSeenAt: lastSeenAt[partnerId],
      }),
    };
  });

  const roomItems: SidebarItem[] = Object.values(roomPreviews)
    .filter((r) => r.server_id == null)
    .map((r) => ({
      kind: "room",
      id: r.id,
      name: r.name,
      time: r.last_message_at ?? r.inserted_at,
      preview: r.last_message
        ? getPreviewText(r.last_message, "No messages yet")
        : "No messages yet",
      unread: r.unread_count,
    }));

  const allItems = [...directItems, ...roomItems].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
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
      setActiveChat({
        type: "direct",
        partnerId: item.id,
        partnerRef: conversationPreviews[item.id]?.partner_public_id ?? item.id,
      });
    } else {
      const roomPreview = roomPreviews[item.id];
      if (roomPreview) {
        setActiveChat(roomChatForPreview(roomPreview));
      } else {
        setActiveChat({ type: "room", roomId: item.id });
      }
    }
  };

  return (
    <div
      className={cn("flex h-full w-full flex-col", isServerMode && "w-[60px]")}
    >
      {!isServerMode && (
        <div className="border-b border-border p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h1 className="text-lg font-medium tracking-tight">Messages</h1>
            <button
              onClick={() => openModal("CREATE_PICKER")}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
            >
              New
            </button>
          </div>
          <UserSearch />
        </div>
      )}

      {!isServerMode && serverList.length > 0 && (
        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Servers
            </span>
            <button
              onClick={() => openModal("CREATE_SERVER")}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-sm hover:bg-accent"
              aria-label="Create server"
            >
              +
            </button>
          </div>
          <div className="space-y-1">
            {serverList.map((server) => (
              <button
                key={server.id}
                onClick={() =>
                  setActiveChat(serverChatForServer(server))
                }
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left hover:border-border hover:bg-card"
              >
                <Avatar name={server.name} size="small" />
                <span className="truncate text-sm">{server.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {allItems.map((item) => {
          const isActive = isItemActive(item);
          return (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => handleItemClick(item)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left hover:border-border hover:bg-card/70",
                isActive && "border-border bg-card",
              )}
              data-testid={`sidebar-item-${item.kind}-${item.id}`}
              data-presence-status={item.kind === "direct" ? item.status ?? "offline" : undefined}
              title={item.kind === "direct" ? item.presenceText : undefined}
            >
              <Avatar
                name={item.name}
                size="medium"
                status={
                  item.kind === "direct"
                    ? item.status || (item.isOnline ? "online" : "offline")
                    : null
                }
              />
              {!isServerMode && (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{item.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatPreviewTime(item.time)}
                    </span>
                  </div>
                  {item.kind === "direct" && item.presenceText && (
                    <span className="sr-only">{item.presenceText}</span>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    <EmojiText text={item.preview} size={12} />
                  </p>
                </div>
              )}
              {!isServerMode && item.unread > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                  {item.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeModal === "CREATE_ROOM" && (
        <CreateRoomModal onClose={closeModal} />
      )}
      {activeModal === "CREATE_SERVER" && (
        <CreateServerModal onClose={closeModal} />
      )}
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
