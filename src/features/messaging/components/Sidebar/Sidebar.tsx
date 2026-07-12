import { useEffect, useMemo, useState } from "react";
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
import { sortConversationItems } from "../../utils/conversationOrdering";
import { getPreviewText } from "../../utils/attachments";

interface SidebarProps {
  isServerMode?: boolean;
  isCollapsed?: boolean;
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

export function Sidebar({ isServerMode = false, isCollapsed = false }: SidebarProps) {
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

  const directItems: SidebarItem[] = useMemo(
    () =>
      Object.values(conversationPreviews).map((p) => {
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
      }),
    [conversationPreviews, lastSeenAt, onlineUserIds, userStatuses],
  );

  const roomItems: SidebarItem[] = useMemo(
    () =>
      Object.values(roomPreviews)
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
        })),
    [roomPreviews],
  );

  const allItems = useMemo(
    () =>
      sortConversationItems([...directItems, ...roomItems]),
    [directItems, roomItems],
  );

  const serverList = useMemo(() => Object.values(servers), [servers]);

  const isItemActive = (item: SidebarItem): boolean => {
    if (!activeChat) return false;
    if (item.kind === "direct")
      return activeChat.type === "direct" && activeChat.partnerId === item.id;
    return activeChat.type === "room" && activeChat.roomId === item.id;
  };

  const isServerActive = (serverId: number): boolean => {
    if (!activeChat) return false;
    if (activeChat.type === "server") return activeChat.serverId === serverId;
    if (activeChat.type === "channel") return activeChat.serverId === serverId;
    return false;
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

  const listRowClass = (isActive: boolean, collapsed: boolean) =>
    cn(
      "relative flex w-full items-center transition-colors",
      collapsed
        ? "justify-center rounded-[12px] px-2 py-2.5"
        : "h-[62px] gap-[11px] border-b border-transparent px-[10px] text-left",
      isActive ? "bg-accent" : "hover:bg-card/70",
    );

  const hasListContent = serverList.length > 0 || allItems.length > 0;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col bg-[var(--vetra-shell-sidebar-bg)]",
        isServerMode && "w-[72px]",
      )}
    >
      {!isServerMode && !isCollapsed && (
        <div className="h-[54px] px-[11px] pt-[9px]">
          <div className="[&_input]:h-[35px] [&_input]:w-full [&_input]:rounded-[18px] [&_input]:border-0 [&_input]:bg-card/80 [&_input]:px-9 [&_input]:pr-10 [&_input]:text-sm [&_input]:shadow-none">
            <UserSearch />
          </div>
        </div>
      )}

      <div className={cn("flex-1 overflow-y-auto", !isServerMode && !isCollapsed ? "py-1" : "px-3 py-3")}>
        {!hasListContent && !isServerMode ? (
          <div
            className={cn(
              "mx-3 rounded-[12px] border border-border bg-card/70 px-4 py-5",
              isCollapsed && "text-center",
            )}
          >
            <div className="space-y-1.5">
              <span className="vt-kicker">No conversations</span>
              {!isCollapsed && (
                <p className="text-sm text-muted-foreground">
                  Start a direct chat or create a room to begin messaging.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className={isServerMode || isCollapsed ? "space-y-1.5" : undefined}>
            {!isServerMode &&
              serverList.map((server) => {
                const isActive = isServerActive(server.id);
                return (
                  <button
                    key={server.id}
                    onClick={() => setActiveChat(serverChatForServer(server))}
                    className={listRowClass(isActive, isCollapsed)}
                    data-testid={`sidebar-item-server-${server.id}`}
                    title={server.name}
                  >
                    <Avatar
                      name={server.name}
                      size="medium"
                      className={isCollapsed ? undefined : "h-[46px] w-[46px] text-base"}
                    />
                    {!isCollapsed && (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {server.name}
                      </span>
                    )}
                  </button>
                );
              })}
            {allItems.map((item) => {
              const isActive = isItemActive(item);
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => handleItemClick(item)}
                  className={listRowClass(isActive, isServerMode || isCollapsed)}
                  data-testid={`sidebar-item-${item.kind}-${item.id}`}
                  data-presence-status={item.kind === "direct" ? item.status ?? "offline" : undefined}
                  title={
                    isServerMode || isCollapsed
                      ? item.name
                      : item.kind === "direct"
                        ? item.presenceText
                        : undefined
                  }
                >
                  <Avatar
                    name={item.name}
                    size="medium"
                    className={isServerMode || isCollapsed ? undefined : "h-[46px] w-[46px] text-base"}
                    status={
                      item.kind === "direct"
                        ? item.status || (item.isOnline ? "online" : "offline")
                        : null
                    }
                  />
                  {!isCollapsed && !isServerMode && (
                    <div className="relative h-full min-w-0 flex-1">
                      <span className="absolute left-0 right-12 top-[14px] truncate text-sm font-medium">
                        {item.name}
                      </span>
                      <span className="absolute right-[10px] top-[14px] text-[11px] text-muted-foreground">
                        {formatPreviewTime(item.time)}
                      </span>
                      {item.kind === "direct" && item.presenceText && (
                        <span className="sr-only">{item.presenceText}</span>
                      )}
                      <p className="absolute left-0 right-[10px] top-[34px] h-[18px] truncate text-xs text-muted-foreground">
                        <EmojiText text={item.preview} size={12} />
                      </p>
                    </div>
                  )}
                  {(isServerMode || isCollapsed) && item.unread > 0 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 py-1 text-[10px] font-semibold leading-none text-primary-foreground">
                      {item.unread}
                    </span>
                  )}
                  {!isCollapsed && !isServerMode && item.unread > 0 && (
                    <span className="rounded-full bg-primary px-2 py-1 text-[10px] font-semibold leading-none text-primary-foreground">
                      {item.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
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
