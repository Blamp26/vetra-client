import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  buildHashForActiveChat,
  roomChatForPreview,
  serverChatForServer,
} from "@/shared/utils/chatRoutes";
import {
  getPresenceText,
  resolvePresenceStatus,
} from "@/shared/utils/presence";
import { sortConversationItems } from "../../utils/conversationOrdering";
import { getPreviewText } from "../../utils/attachments";
import { EmptyPane } from "@/shared/components/EmptyPane";
import { Settings } from "lucide-react";
import type { ActiveChat } from "@/shared/types";
import { formatUnreadCount } from "../../utils/unread";
import { broadcastChannelsApi } from "@/api/broadcastChannels";
import { CreateBroadcastChannelModal } from "@/features/broadcastChannels/components/CreateBroadcastChannelModal";

interface SidebarProps {
  isServerMode?: boolean;
  isCollapsed?: boolean;
  serverPanel?: ReactNode;
  activeBroadcastChannelPublicId?: string | null;
  onNavigateToHash?: (nextHash: string) => void;
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
      avatar_url?: string | null;
      time: string;
      preview: string;
      unread: number;
    };

export function Sidebar({
  isServerMode = false,
  isCollapsed = false,
  serverPanel = null,
  activeBroadcastChannelPublicId = null,
  onNavigateToHash,
}: SidebarProps) {
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
  const broadcastChannels = useAppStore((s: RootState) => s.broadcastChannels ?? {});
  const setBroadcastSubscriptions = useAppStore((s: RootState) => s.setBroadcastSubscriptions);

  const [showProfile, setShowProfile] = useState(false);
  const openGroupSettings = useAppStore((s: RootState) => s.openGroupSettings);
  const serverPanelRef = useRef<HTMLDivElement | null>(null);
  const focusRestoreRef = useRef<HTMLElement | null>(null);
  const previousServerModeRef = useRef(isServerMode);
  const [overlayOpen, setOverlayOpen] = useState(isServerMode);
  const [overlayA11yHidden, setOverlayA11yHidden] = useState(!isServerMode);

  useLayoutEffect(() => {
    const panel = serverPanelRef.current;
    if (!panel) return;
    if (isServerMode) {
      setOverlayA11yHidden(false);
      panel.removeAttribute("inert");
      setOverlayOpen(true);
    } else {
      if (previousServerModeRef.current && panel.contains(document.activeElement)) {
        const preferredTarget = focusRestoreRef.current;
        const fallbackTarget =
          document.querySelector<HTMLElement>('[data-testid^="sidebar-item-"]') ??
          document.querySelector<HTMLElement>('[data-testid="user-search"]');
        const target = preferredTarget?.isConnected ? preferredTarget : fallbackTarget;
        target?.focus({ preventScroll: true });
        if (panel.contains(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
        }
      }
      setOverlayA11yHidden(true);
      panel.setAttribute("inert", "");
      setOverlayOpen(false);
    }
    previousServerModeRef.current = isServerMode;
  }, [isServerMode]);

  useEffect(() => {
    if (!currentUser) return;
    serversApi
      .getList()
      .then(setServers)
      .catch((err) => console.error("Failed to load servers:", err));
  }, [currentUser, setServers]);

  useEffect(() => {
    if (!currentUser) return;
    broadcastChannelsApi.subscribed().then(setBroadcastSubscriptions).catch(() => undefined);
  }, [currentUser, setBroadcastSubscriptions]);

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
          avatar_url: r.avatar_url,
          time: r.last_message_at ?? r.inserted_at,
          preview: r.last_message
            ? getPreviewText(r.last_message, "No messages yet")
            : "No messages yet",
          unread: r.unread_count,
        })),
    [roomPreviews],
  );

  const allItems = useMemo(
    () => sortConversationItems([...directItems, ...roomItems]),
    [directItems, roomItems],
  );

  const serverList = useMemo(() => Object.values(servers), [servers]);

  const isItemActive = (item: SidebarItem): boolean => {
    if (activeBroadcastChannelPublicId) return false;
    if (!activeChat) return false;
    if (item.kind === "direct")
      return activeChat.type === "direct" && activeChat.partnerId === item.id;
    return activeChat.type === "room" && activeChat.roomId === item.id;
  };

  const isServerActive = (serverId: number): boolean => {
    if (activeBroadcastChannelPublicId) return false;
    if (!activeChat) return false;
    if (activeChat.type === "server") return activeChat.serverId === serverId;
    if (activeChat.type === "channel") return activeChat.serverId === serverId;
    return false;
  };

  const navigateToChat = (chat: ActiveChat, initiator?: HTMLElement) => {
    if (initiator) focusRestoreRef.current = initiator;
    onNavigateToHash?.(
      buildHashForActiveChat(chat, {
        activeChat,
        currentUser,
        conversationPreviews,
        roomPreviews,
        servers,
        serverChannels: {},
        searchResults: { users: [], servers: [] },
      }),
    );
    setActiveChat(chat);
  };

  const handleItemClick = (item: SidebarItem, initiator?: HTMLElement) => {
    if (item.kind === "direct") {
      navigateToChat({
        type: "direct",
        partnerId: item.id,
        partnerRef: conversationPreviews[item.id]?.partner_public_id ?? item.id,
      }, initiator);
    } else {
      const roomPreview = roomPreviews[item.id];
      if (roomPreview) {
        navigateToChat(roomChatForPreview(roomPreview), initiator);
      } else {
        navigateToChat({ type: "room", roomId: item.id }, initiator);
      }
    }
  };

  const listRowClass = (isActive: boolean, collapsed: boolean) =>
    cn(
      "relative flex w-full items-center rounded-[8px] transition-colors",
      collapsed
        ? "justify-center px-2 py-2.5"
        : "h-[62px] gap-[11px] px-[10px] text-left",
      isActive ? "bg-accent/70" : "hover:bg-card/70",
    );

  const hasListContent = serverList.length > 0 || allItems.length > 0;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col bg-[var(--vetra-shell-sidebar-bg)]",
      )}
    >
      {!isCollapsed && (
        <div className="h-[54px] px-[11px] pt-[9px]">
          <UserSearch />
        </div>
      )}

      <div
        className={cn(
          "relative flex min-h-0 flex-1",
        )}
      >
        <div className={cn("min-h-0 flex-1 overflow-y-auto", !isCollapsed && "py-1")}>
        {!hasListContent ? (
          <EmptyPane
            title="No conversations"
            description={
              isCollapsed
                ? undefined
                : "Start a direct chat or create a room to begin messaging."
            }
            density="compact"
            align={isCollapsed ? "center" : "start"}
            titleLevel={3}
            className={cn(
              "mx-3 px-4 py-5",
              isCollapsed &&
                "px-1 py-3 text-center [&_.vt-empty-pane__title]:truncate",
            )}
          />
        ) : (
          <div>
            {Object.values(broadcastChannels).map((channel) => {
                const active = activeBroadcastChannelPublicId === channel.public_id;
                return <button key={channel.public_id} type="button" onClick={(event) => { focusRestoreRef.current = event.currentTarget; onNavigateToHash?.(`#/broadcast/${channel.public_id}`); }} className={listRowClass(active, isCollapsed)} data-testid={`sidebar-item-broadcast-${channel.public_id}`} data-state={active ? "active" : "inactive"} aria-label={isServerMode ? channel.display_name : undefined} title={channel.display_name}>
                  <Avatar name={channel.display_name} size="medium" />
                  {!isCollapsed && <span className="min-w-0 flex-1 truncate text-sm font-medium" aria-hidden={isServerMode}>{channel.display_name}</span>}
                </button>;
            })}
            {serverList.map((server) => {
                const isActive = isServerActive(server.id);
                return (
                  <button
                    key={server.id}
                    onClick={(event) => navigateToChat(serverChatForServer(server), event.currentTarget)}
                    className={listRowClass(isActive, isCollapsed)}
                    data-testid={`sidebar-item-server-${server.id}`}
                    data-state={isActive ? "active" : "inactive"}
                    aria-label={isServerMode ? server.name : undefined}
                    title={server.name}
                  >
                    <span className={cn("vt-server-avatar-cell", isCollapsed && "is-collapsed", isActive && "is-active")}>
                      <Avatar
                        name={server.name}
                        size="medium"
                        className={
                          isCollapsed ? undefined : "h-[46px] w-[46px] text-base"
                        }
                      />
                    </span>
                    {!isCollapsed && (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium" aria-hidden={isServerMode}>
                        {server.name}
                      </span>
                    )}
                  </button>
                );
            })}
            {allItems.map((item) => {
              const isActive = isItemActive(item);
              return (
                <div className="group relative" key={`${item.kind}-${item.id}`}>
                  <button
                    onClick={(event) => handleItemClick(item, event.currentTarget)}
                    className={listRowClass(isActive, isCollapsed)}
                    data-testid={`sidebar-item-${item.kind}-${item.id}`}
                    data-state={isActive ? "active" : "inactive"}
                    aria-label={isServerMode ? item.name : undefined}
                    data-presence-status={
                      item.kind === "direct"
                        ? (item.status ?? "offline")
                        : undefined
                    }
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
                      src={item.kind === "room" ? item.avatar_url ?? null : null}
                      size="medium"
                      className={
                        isCollapsed ? undefined : "h-[46px] w-[46px] text-base"
                      }
                      status={
                        item.kind === "direct"
                          ? item.status ||
                            (item.isOnline ? "online" : "offline")
                          : null
                      }
                    />
                    {!isCollapsed && (
                      <div
                        className="relative h-full min-w-0 flex-1"
                        aria-hidden={isServerMode}
                      >
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
                      <span
                        aria-label={`${item.unread} unread messages`}
                        className="absolute right-1.5 top-1.5 flex min-w-5 justify-center rounded-full bg-primary px-1.5 py-1 text-[10px] font-semibold leading-none text-primary-foreground"
                      >
                        {formatUnreadCount(item.unread)}
                      </span>
                    )}
                    {!isCollapsed && !isServerMode && item.unread > 0 && (
                      <span
                        aria-label={`${item.unread} unread messages`}
                        className="flex min-w-5 justify-center rounded-full bg-primary px-1.5 py-1 text-[10px] font-semibold leading-none text-primary-foreground"
                      >
                        {formatUnreadCount(item.unread)}
                      </span>
                    )}
                  </button>
                  {item.kind === "room" &&
                    !isCollapsed &&
                    !isServerMode &&
                    roomPreviews[item.id] && (
                      <button
                        aria-label={`Manage ${item.name}`}
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGroupSettings(item.id, {
                            settingsOrigin: "sidebar",
                            restoreFocus: e.currentTarget,
                          });
                        }}
                      >
                        <Settings className="h-3 w-3" />
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        )}
        </div>

        <div
          ref={serverPanelRef}
          className="vt-channel-panel-overlay"
          data-state={overlayOpen ? "open" : "closed"}
          aria-hidden={overlayA11yHidden}
        >
          {serverPanel}
        </div>
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
          onPickBroadcastChannel={() => openModal("CREATE_BROADCAST_CHANNEL")}
        />
      )}
      {activeModal === "CREATE_BROADCAST_CHANNEL" && <CreateBroadcastChannelModal onClose={closeModal} />}
      {showProfile && currentUser && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}
