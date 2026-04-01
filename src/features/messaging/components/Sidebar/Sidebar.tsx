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
import { SquarePen, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@radix-ui/react-tooltip";
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
  const setActiveChat        = useAppStore((s: RootState) => s.setActiveChat);
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
  const hasItems = allItems.length > 0;

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
    <>
      <div className={cn(
        "flex h-full w-full flex-col",
        isServerMode && "w-[72px]"
      )}>
        {!isServerMode && (
          <div className="px-4 pt-4">
            <div className="rounded-[1.75rem] border border-border/70 bg-card/80 p-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.28)]">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="inline-flex rounded-full border border-border/50 bg-background px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-muted-foreground shadow-sm">
                    Inbox
                  </span>
                  <div className="space-y-1">
                    <h1 className="text-[1.55rem] font-semibold tracking-tight text-sidebar-foreground">
                      Messages
                    </h1>
                    <p className="max-w-[18rem] text-sm leading-5 text-muted-foreground">
                      {hasItems
                        ? `${allItems.length} conversations ready to open`
                        : "All your conversations and threads in one place."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openModal("CREATE_PICKER")}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-background text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-accent hover:text-foreground active:translate-y-0 active:scale-[0.95] shadow-sm"
                  aria-label="New chat"
                  title="Start a new chat"
                >
                  <SquarePen className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {!isServerMode && (
          <div className="px-4 pt-4">
            <UserSearch />
          </div>
        )}

        {/* ── Servers section ── */}
        {!isServerMode && serverList.length > 0 && (
          <div className="px-4 pt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground">
                Servers
              </span>
              <button
                onClick={() => openModal("CREATE_SERVER")}
                className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                title="Create a server"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {serverList.map((server) => (
                <button
                  key={server.id}
                  onClick={() => { window.location.hash = `/s/${server.id}`; }}
                  className="flex w-full items-center gap-3 rounded-[1.25rem] border border-transparent px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-border/70 hover:bg-card/80 hover:shadow-[0_16px_32px_-28px_rgba(15,23,42,0.35)] active:translate-y-0 active:scale-[0.99]"
                >
                  <Avatar
                    name={server.name}
                    size="large"
                    className="size-8 h-9 w-9 shrink-0 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.35)]"
                    status={null}
                  />
                  <span className="truncate text-sm font-semibold text-sidebar-foreground">
                    {server.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={cn("px-4 pb-2 pt-5", isServerMode && "hidden")}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground">
              Recent chats
            </span>
            <span className="rounded-full bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {allItems.length}
            </span>
          </div>
        </div>

        <div dir="ltr" data-slot="scroll-area" className="relative flex-1 overflow-hidden">
          <style>{`[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`}</style>
          <div data-radix-scroll-area-viewport="" data-slot="scroll-area-viewport" className="focus-visible:ring-ring/50 size-full transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1 overflow-y-auto overflow-x-hidden">
            <div className="space-y-1 px-2.5 pb-3">
              {hasItems ? (
                <TooltipProvider delayDuration={400}>
                  {allItems.map((item) => {
                    const isActive = isItemActive(item);

                    return (
                      <Tooltip key={`${item.kind}-${item.id}`}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleItemClick(item)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-[1.25rem] border border-transparent px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-border/70 hover:bg-card/80 hover:shadow-[0_16px_32px_-28px_rgba(15,23,42,0.35)] active:translate-y-0 active:scale-[0.99]",
                              isActive && "border-border/70 bg-card text-foreground shadow-[0_18px_36px_-26px_rgba(15,23,42,0.35)]"
                            )}
                          >
                            <div className="relative">
                              <Avatar
                                name={item.name}
                                size="large"
                                className="size-8 h-10 w-10 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.35)]"
                                status={item.kind === "direct" ? (item.status || (item.isOnline ? "online" : "offline")) : null}
                              />
                            </div>

                            {!isServerMode && (
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-semibold text-sidebar-foreground">{item.name}</span>
                                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                                    {formatPreviewTime(item.time)}
                                  </span>
                                </div>
                                <p className="truncate pt-0.5 text-sm leading-5 text-muted-foreground">
                                  <EmojiText text={item.preview} size={14} />
                                </p>
                              </div>
                            )}

                            {!isServerMode && item.unread > 0 && (
                              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-unread px-1.5 text-[11px] font-semibold text-unread-foreground shadow-[0_10px_24px_-16px_rgba(15,23,42,0.55)]">
                                {item.unread}
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        {isServerMode && (
                          <TooltipContent side="right" className="z-50 rounded-xl border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in zoom-in-95 duration-100">
                            <p>{item.name}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>
              ) : !isServerMode ? (
                <div className="space-y-3 px-1.5">
                  {/* MOBILE-ONLY: Full card empty state */}
                  <div className="lg:hidden rounded-[1.5rem] border border-border/50 bg-muted/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="space-y-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-primary text-primary-foreground shadow-sm shadow-primary/30">
                        <SquarePen className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-base font-semibold tracking-tight text-sidebar-foreground">
                          Your inbox is empty
                        </h2>
                        <p className="text-sm leading-6 text-muted-foreground">
                          Search for a teammate or create a room to start your first thread.
                        </p>
                      </div>
                      <button
                        onClick={() => openModal("CREATE_PICKER")}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all duration-200 active:scale-95 shadow-sm shadow-primary/20 hover:bg-primary/90"
                      >
                        Start a conversation
                      </button>
                    </div>
                  </div>

                  {/* DESKTOP-ONLY: Minimalist placeholder */}
                  <div className="hidden lg:flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                      <SquarePen className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground/60">
                      No conversations yet
                    </span>
                  </div>
                </div>
              ) : null}
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