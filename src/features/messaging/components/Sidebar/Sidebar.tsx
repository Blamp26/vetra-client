import { useMemo, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { UserSearch } from "../UserSearch/UserSearch";
import { ProfileModal } from "@/features/profile/components/ProfileModal/ProfileModal";
import { formatPreviewTime } from "@/utils/formatDate";
import { Avatar } from "@/shared/components/Avatar";
import { cn } from "@/shared/utils/cn";
import { EmojiText } from "@/shared/components/Emoji/Emoji";
import {
  getPresenceText,
  resolvePresenceStatus,
} from "@/shared/utils/presence";
import { sortConversationItems } from "../../utils/conversationOrdering";
import { getPreviewText } from "../../utils/attachments";
import { EmptyPane } from "@/shared/components/EmptyPane";
import { GroupSettingsModal } from "../GroupSettingsModal/GroupSettingsModal";
import { Settings } from "lucide-react";
import type { RoomPreview } from "@/shared/types";
import { formatUnreadCount } from "../../utils/unread";
import { roomChatForPreview } from "@/shared/utils/chatRoutes";

interface SidebarProps {
  isCollapsed?: boolean;
  /** @deprecated navigation context is owned by the permanent rail */ isServerMode?: boolean;
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

export function Sidebar({ isCollapsed = false }: SidebarProps) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const activeChat = useAppStore((s: RootState) => s.activeChat);
  const conversationPreviews = useAppStore(
    (s: RootState) => s.conversationPreviews,
  );
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);
  const onlineUserIds = useAppStore((s: RootState) => s.onlineUserIds);
  const userStatuses = useAppStore((s: RootState) => s.userStatuses);
  const lastSeenAt = useAppStore((s: RootState) => s.lastSeenAt);
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);
  const openModal = useAppStore((s: RootState) => s.openModal);
  const [showProfile, setShowProfile] = useState(false);
  const [settingsRoom, setSettingsRoom] = useState<RoomPreview | null>(null);

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
    () => sortConversationItems([...directItems, ...roomItems]),
    [directItems, roomItems],
  );

  const isItemActive = (item: SidebarItem) =>
    item.kind === "direct"
      ? activeChat?.type === "direct" && activeChat.partnerId === item.id
      : activeChat?.type === "room" && activeChat.roomId === item.id;
  const listRowClass = (active: boolean) =>
    cn(
      "relative flex w-full items-center rounded-[8px] transition-colors",
      isCollapsed
        ? "justify-center px-2 py-2.5"
        : "h-[62px] gap-[11px] px-[10px] text-left",
      active ? "bg-accent/70" : "hover:bg-card/70",
    );
  const focusSearch = () =>
    document
      .querySelector<HTMLInputElement>(
        'input[aria-label="Search people or servers"]',
      )
      ?.focus();

  return (
    <div className="flex h-full w-full flex-col bg-[var(--vetra-shell-sidebar-bg)]">
      {!isCollapsed && (
        <div className="border-b border-border px-[11px] py-2">
          <UserSearch />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              aria-label="New chat"
              className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
              onClick={focusSearch}
            >
              New chat
            </button>
            <button
              type="button"
              aria-label="New group"
              className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
              onClick={() => openModal("CREATE_ROOM")}
            >
              New group
            </button>
          </div>
        </div>
      )}
      <div
        className={cn(
          "flex-1 overflow-y-auto",
          !isCollapsed ? "py-1" : "px-3 py-3",
        )}
      >
        {allItems.length === 0 ? (
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
          <div className={isCollapsed ? "space-y-1.5" : undefined}>
            {allItems.map((item) => (
              <div className="group relative" key={`${item.kind}-${item.id}`}>
                <button
                  onClick={() =>
                    setActiveChat(
                      item.kind === "direct"
                        ? {
                            type: "direct",
                            partnerId: item.id,
                            partnerRef:
                              conversationPreviews[item.id]
                                ?.partner_public_id ?? item.id,
                          }
                        : roomPreviews[item.id]
                          ? roomChatForPreview(roomPreviews[item.id])
                          : { type: "room", roomId: item.id },
                    )
                  }
                  className={listRowClass(isItemActive(item))}
                  data-testid={`sidebar-item-${item.kind}-${item.id}`}
                  data-state={isItemActive(item) ? "active" : "inactive"}
                  data-presence-status={
                    item.kind === "direct"
                      ? (item.status ?? "offline")
                      : undefined
                  }
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
                    className={
                      isCollapsed ? undefined : "h-[46px] w-[46px] text-base"
                    }
                    status={
                      item.kind === "direct"
                        ? item.status || (item.isOnline ? "online" : "offline")
                        : null
                    }
                  />
                  {!isCollapsed && (
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
                  {item.unread > 0 && (
                    <span
                      aria-label={`${item.unread} unread messages`}
                      className={cn(
                        "flex min-w-5 justify-center rounded-full bg-primary px-1.5 py-1 text-[10px] font-semibold leading-none text-primary-foreground",
                        isCollapsed && "absolute right-1.5 top-1.5",
                      )}
                    >
                      {formatUnreadCount(item.unread)}
                    </span>
                  )}
                </button>
                {item.kind === "room" &&
                  !isCollapsed &&
                  roomPreviews[item.id] && (
                    <button
                      aria-label={`Manage ${item.name}`}
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettingsRoom(roomPreviews[item.id]);
                      }}
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
      {showProfile && currentUser && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfile(false)}
        />
      )}
      {settingsRoom && (
        <GroupSettingsModal
          room={settingsRoom}
          onClose={() => setSettingsRoom(null)}
        />
      )}
    </div>
  );
}
