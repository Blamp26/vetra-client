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
      [...directItems, ...roomItems].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      ),
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

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col bg-[var(--vetra-shell-sidebar-bg)]",
        isServerMode && "w-[72px]",
      )}
    >
      {!isServerMode && (
        <div className="border-b border-border px-4 pb-4 pt-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="vt-kicker">Inbox</span>
              <h1 className="text-xl font-semibold tracking-tight">Messages</h1>
            </div>
            <button
              onClick={() => openModal("CREATE_PICKER")}
              className="vt-button vt-button--primary shrink-0 rounded-md"
            >
              New
            </button>
          </div>
          <UserSearch />
        </div>
      )}

      {!isServerMode && serverList.length > 0 && (
        <div className="border-b border-border px-4 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="vt-kicker">
              Servers
            </span>
            <button
              onClick={() => openModal("CREATE_SERVER")}
              className="vt-button vt-button--ghost vt-button--icon h-8 w-8 px-0"
              aria-label="Create server"
            >
              +
            </button>
          </div>
          <div className="space-y-1.5">
            {serverList.map((server) => (
              <button
                key={server.id}
                onClick={() =>
                  setActiveChat(serverChatForServer(server))
                }
                className={cn(
                  "flex w-full items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors",
                  isServerActive(server.id)
                    ? "border-primary/30 bg-accent"
                    : "border-transparent hover:border-border hover:bg-card/75",
                )}
              >
                <Avatar name={server.name} size="small" />
                <span className="truncate text-sm">{server.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {allItems.length === 0 && !isServerMode ? (
          <div className="rounded-[12px] border border-border bg-card/70 px-4 py-5">
            <div className="space-y-1.5">
              <span className="vt-kicker">No conversations</span>
              <p className="text-sm text-muted-foreground">
                Start a direct chat or create a room to begin messaging.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {allItems.map((item) => {
              const isActive = isItemActive(item);
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[12px] border px-2.5 py-2.5 text-left transition-colors",
                    isActive
                      ? "border-primary/30 bg-accent"
                      : "border-transparent hover:border-border hover:bg-card/70",
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
                        <span className="truncate text-sm font-medium">{item.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatPreviewTime(item.time)}
                        </span>
                      </div>
                      {item.kind === "direct" && item.presenceText && (
                        <span className="sr-only">{item.presenceText}</span>
                      )}
                      <p className="truncate pt-0.5 text-xs text-muted-foreground">
                        <EmojiText text={item.preview} size={12} />
                      </p>
                    </div>
                  )}
                  {!isServerMode && item.unread > 0 && (
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
