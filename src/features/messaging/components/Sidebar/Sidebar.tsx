import { useEffect, useMemo, useRef, useState } from "react";
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
import { Menu, MessageSquarePlus, Plus } from "lucide-react";

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
  const [isRailMenuOpen, setIsRailMenuOpen] = useState(false);
  const railMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    serversApi
      .getList()
      .then(setServers)
      .catch((err) => console.error("Failed to load servers:", err));
  }, [currentUser, setServers]);

  useEffect(() => {
    if (!isRailMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (railMenuRef.current?.contains(event.target as Node)) return;
      setIsRailMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsRailMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRailMenuOpen]);

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

  const railMenu = (
    <div className="relative flex h-full w-[72px] flex-shrink-0 flex-col border-r border-border bg-[var(--vetra-shell-sidebar-bg)]">
      <div className="relative flex h-[54px] items-center justify-center" ref={railMenuRef}>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Open sidebar menu"
          aria-expanded={isRailMenuOpen}
          aria-haspopup="menu"
          onClick={() => setIsRailMenuOpen((current) => !current)}
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
        {isRailMenuOpen && (
          <div
            className="absolute left-[60px] top-[8px] z-20 min-w-[176px] rounded-[12px] border border-border bg-popover p-1.5 shadow-[var(--overlay-shadow)]"
            data-testid="sidebar-rail-menu"
            role="menu"
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm hover:bg-accent"
              role="menuitem"
              onClick={() => {
                setIsRailMenuOpen(false);
                openModal("CREATE_PICKER");
              }}
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span>New</span>
            </button>
            <button
              type="button"
              className="mt-0.5 flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm hover:bg-accent"
              role="menuitem"
              onClick={() => {
                setIsRailMenuOpen(false);
                openModal("CREATE_SERVER");
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Create server</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-2">
          {serverList.map((server) => (
            <button
              key={server.id}
              onClick={() => setActiveChat(serverChatForServer(server))}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-[14px] border transition-colors",
                isServerActive(server.id)
                  ? "border-primary/30 bg-accent"
                  : "border-transparent hover:border-border hover:bg-card/75",
              )}
              title={server.name}
              aria-label={server.name}
            >
              <Avatar name={server.name} size="small" className="h-8 w-8 text-sm" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "flex h-full w-full overflow-hidden bg-[var(--vetra-shell-sidebar-bg)]",
        isServerMode && "w-[72px]",
      )}
    >
      {railMenu}

      {!isServerMode && (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-[54px] border-b border-border px-[11px] pt-[9px]">
            <div className="[&_input]:h-[35px] [&_input]:w-full [&_input]:rounded-[18px] [&_input]:border-0 [&_input]:bg-card/80 [&_input]:px-9 [&_input]:pr-10 [&_input]:text-sm [&_input]:shadow-none">
              <UserSearch />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
        {allItems.length === 0 && !isServerMode ? (
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
          <div>
            {allItems.map((item) => {
              const isActive = isItemActive(item);
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "relative flex h-[62px] w-full items-center gap-[11px] border-b border-transparent px-[10px] text-left transition-colors",
                    isActive
                      ? "bg-accent"
                      : "hover:bg-card/70",
                  )}
                  data-testid={`sidebar-item-${item.kind}-${item.id}`}
                  data-presence-status={item.kind === "direct" ? item.status ?? "offline" : undefined}
                  title={
                    isCollapsed
                      ? item.name
                      : item.kind === "direct"
                        ? item.presenceText
                        : undefined
                  }
                >
                  <Avatar
                    name={item.name}
                    size="medium"
                    className="h-[46px] w-[46px] text-base"
                    status={
                      item.kind === "direct"
                        ? item.status || (item.isOnline ? "online" : "offline")
                        : null
                    }
                  />
                  {!isCollapsed && (
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
                  {!isCollapsed && item.unread > 0 && (
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
        </div>
      )}

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
