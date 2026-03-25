import { useEffect, useMemo, useState } from "react";
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

interface SidebarProps {
  isServerMode?:  boolean;
  onOpenSettings: () => void;
}

type SidebarItem =
  | { kind: "direct"; id: number; name: string; time: string; preview: string; unread: number; isOnline: boolean }
  | { kind: "room";   id: number; name: string; time: string; preview: string; unread: number };

export function Sidebar({ isServerMode = false, onOpenSettings }: SidebarProps) {
  const currentUser          = useAppStore((s: RootState) => s.currentUser);
  const activeChat           = useAppStore((s: RootState) => s.activeChat);
  const conversationPreviews = useAppStore((s: RootState) => s.conversationPreviews);
  const roomPreviews         = useAppStore((s: RootState) => s.roomPreviews);
  const onlineUserIds        = useAppStore((s: RootState) => s.onlineUserIds);
  const setActiveChat        = useAppStore((s: RootState) => s.setActiveChat);
  const setServers           = useAppStore((s: RootState) => s.setServers);
  const activeModal          = useAppStore((s: RootState) => s.activeModal);
  const openModal            = useAppStore((s: RootState) => s.openModal);
  const closeModal           = useAppStore((s: RootState) => s.closeModal);
  const micEnabled           = useAppStore((s: RootState) => s.micEnabled);
  const soundEnabled         = useAppStore((s: RootState) => s.soundEnabled);
  const toggleMic            = useAppStore((s: RootState) => s.toggleMic);
  const toggleSound          = useAppStore((s: RootState) => s.toggleSound);

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

  const displayName  = currentUser?.display_name || currentUser?.username || "?";
  const isOnline     = currentUser ? onlineUserIds.has(Number(currentUser.id)) : false;

  const statusText = useMemo(() => {
    if (!soundEnabled) return "Sound muted";
    if (!micEnabled) return "Microphone muted";
    return isOnline ? "Online" : "Offline";
  }, [isOnline, micEnabled, soundEnabled]);

  return (
    <>
      <div className={cn(
        "flex h-full w-80 flex-col border-r border-border bg-sidebar transition-[width] duration-200",
        isServerMode && "w-[72px]"
      )}>
        {/* Search */}
        <div className="p-4">
          <UserSearch />
        </div>

        {/* Messages Header */}
        <div className={cn("px-4 pb-2", isServerMode && "hidden")}>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Messages</span>
        </div>

        {/* Scrollable Area */}
        <div dir="ltr" data-slot="scroll-area" className="relative flex-1 px-2" style={{ position: "relative", "--radix-scroll-area-corner-width": "0px", "--radix-scroll-area-corner-height": "0px" } as React.CSSProperties}>
          <style>{`[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`}</style>
          <div data-radix-scroll-area-viewport="" data-slot="scroll-area-viewport" className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1" style={{ overflow: "hidden scroll" }}>
            <div style={{ minWidth: "100%", display: "table" }}>
              <div className="space-y-1">
                {allItems.map((item) => {
                  const isActive = isItemActive(item);
                  const previewText = item.preview.length > 40 ? item.preview.slice(0, 40) + "…" : item.preview;
                  
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-sidebar-accent",
                        isActive && "bg-sidebar-accent"
                      )}
                    >
                      <div className="relative">
                        <span data-slot="avatar" className="relative flex size-8 shrink-0 overflow-hidden rounded-full h-10 w-10">
                          <Avatar name={item.name} />
                        </span>
                        {item.kind === "direct" && item.isOnline && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-sidebar bg-emerald-500"></span>
                        )}
                      </div>
                      
                      {!isServerMode && (
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sidebar-foreground truncate">{item.name}</span>
                            <span className="text-xs text-muted-foreground ml-2 shrink-0">
                              {formatPreviewTime(item.time)}
                            </span>
                          </div>
                          <p className="truncate text-sm text-muted-foreground">{previewText}</p>
                        </div>
                      )}

                      {!isServerMode && item.unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                          {item.unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3">
          <div className="rounded-xl bg-card shadow-lg ring-1 ring-border p-3">
            {/* Voice Status */}
            <div className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-2 mb-3">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-rss h-4 w-4 text-emerald-500" aria-hidden="true">
                  <path d="M4 11a9 9 0 0 1 9 9"></path>
                  <path d="M4 4a16 16 0 0 1 16 16"></path>
                  <circle cx="5" cy="19" r="1"></circle>
                </svg>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-emerald-500">Voice Connected</span>
                  <span className="text-[10px] text-muted-foreground">dota / myau</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-end gap-0.5 h-3">
                  <div className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{ height: "8px", animationDelay: "100ms", animationDuration: "400ms" }}></div>
                  <div className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{ height: "12px", animationDelay: "200ms", animationDuration: "400ms" }}></div>
                  <div className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{ height: "6px", animationDelay: "300ms", animationDuration: "400ms" }}></div>
                  <div className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{ height: "10px", animationDelay: "400ms", animationDuration: "400ms" }}></div>
                </div>
                <button className="flex h-7 w-7 items-center justify-center rounded-md bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-phone-off h-4 w-4" aria-hidden="true">
                    <path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272"></path>
                    <path d="M22 2 2 22"></path>
                    <path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473"></path>
                  </svg>
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-1.5 mb-3">
              <button className="flex h-9 flex-1 items-center justify-center rounded-lg transition-all duration-200 hover:bg-accent hover:text-accent-foreground bg-muted text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-video h-4 w-4" aria-hidden="true">
                  <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path>
                  <rect x="2" y="6" width="14" height="12" rx="2"></rect>
                </svg>
              </button>
              <button className="flex h-9 flex-1 items-center justify-center rounded-lg transition-all duration-200 hover:bg-accent hover:text-accent-foreground bg-muted text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-monitor-up h-4 w-4" aria-hidden="true">
                  <path d="m9 10 3-3 3 3"></path>
                  <path d="M12 13V7"></path>
                  <rect width="20" height="14" x="2" y="3" rx="2"></rect>
                  <path d="M12 17v4"></path>
                  <path d="M8 21h8"></path>
                </svg>
              </button>
            </div>

            {/* User Profile & Controls */}
            <div className="flex items-center justify-between rounded-lg bg-muted px-2 py-1.5">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowProfile(true)}>
                <div className="relative">
                  <Avatar 
                    name={displayName} 
                    src={currentUser?.avatar_url} 
                    className="h-7 w-7 text-[10px]" 
                  />
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-muted",
                    isOnline ? "bg-emerald-500" : "bg-muted-foreground"
                  )}></span>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-medium text-card-foreground truncate">{displayName}</span>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="truncate">{statusText}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-0.5">
                <button 
                  onClick={() => toggleMic()}
                  title={micEnabled ? "Mute microphone" : "Unmute microphone"}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                    !micEnabled && "text-destructive"
                  )}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic h-3.5 w-3.5" aria-hidden="true">
                    <path d="M12 19v3"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <rect x="9" y="2" width="6" height="13" rx="3"></rect>
                  </svg>
                </button>
                <button 
                  onClick={() => toggleSound()}
                  title={soundEnabled ? "Mute sound" : "Unmute sound"}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                    !soundEnabled && "text-destructive"
                  )}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-headphones h-3.5 w-3.5" aria-hidden="true">
                    <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"></path>
                  </svg>
                </button>
                <button 
                  onClick={onOpenSettings}
                  title="User settings"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings h-3.5 w-3.5" aria-hidden="true">
                    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
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
