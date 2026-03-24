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
import { PlusButton } from "../PlusButton/PlusButton";
import styles from "./Sidebar.module.css";

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
  const servers              = useAppStore((s: RootState) => s.servers);
  const onlineUserIds        = useAppStore((s: RootState) => s.onlineUserIds);
  const setActiveChat        = useAppStore((s: RootState) => s.setActiveChat);
  const setServers           = useAppStore((s: RootState) => s.setServers);
  const activeModal          = useAppStore((s: RootState) => s.activeModal);
  const openModal            = useAppStore((s: RootState) => s.openModal);
  const closeModal           = useAppStore((s: RootState) => s.closeModal);
  const micEnabled           = useAppStore((s: RootState) => s.micEnabled);
  const soundEnabled         = useAppStore((s: RootState) => s.soundEnabled);
  const micCascaded          = useAppStore((s: RootState) => s.micCascaded);
  const toggleMic            = useAppStore((s: RootState) => s.toggleMic);
  const toggleSound          = useAppStore((s: RootState) => s.toggleSound);

  const [showProfile,      setShowProfile]      = useState(false);
  const [soundPulse, setSoundPulse] = useState(false);

  const getPreviewText = (content?: string | null, mediaFileId?: string | null) => {
    if (content && content.trim().length > 0) return content;
    if (mediaFileId) return "📎 Media";
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
    isOnline: onlineUserIds.has(p.partner_id),
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

  const serverList = Object.values(servers).sort(
    (a, b) => new Date(a.inserted_at).getTime() - new Date(b.inserted_at).getTime()
  );

  const isItemActive = (item: SidebarItem): boolean => {
    if (!activeChat) return false;
    if (item.kind === "direct")
      return activeChat.type === "direct" && activeChat.partnerId === item.id;
    return activeChat.type === "room" && activeChat.roomId === item.id;
  };

  const isServerActive = (serverId: number): boolean => {
    if (!activeChat) return false;
    return (
      (activeChat.type === "server"  && activeChat.serverId === serverId) ||
      (activeChat.type === "channel" && activeChat.serverId === serverId)
    );
  };

  const handleItemClick = (item: SidebarItem) => {
    const next: ActiveChat =
      item.kind === "direct"
        ? { type: "direct", partnerId: item.id }
        : { type: "room",   roomId: item.id };
    setActiveChat(next);
  };

  const displayName  = currentUser?.display_name || currentUser?.username || "?";
  const isOnline     = currentUser ? onlineUserIds.has(currentUser.id) : false;

  const statusLine = useMemo(() => {
    if (!soundEnabled) return "Sound off";
    if (!micEnabled) return "Muted";
    return isOnline ? "Online" : "Offline";
  }, [isOnline, micEnabled, soundEnabled]);

  const micTitle = useMemo(() => {
    if (!soundEnabled || micCascaded) return "Enable sound to use your microphone";
    return micEnabled ? "Mute microphone" : "Unmute microphone";
  }, [micCascaded, micEnabled, soundEnabled]);

  const soundTitle = useMemo(() => {
    return soundEnabled ? "Disable sound · will also mute your mic" : "Enable sound";
  }, [soundEnabled]);

  // When sound is disabled, mic is visually disabled (cascaded), but we still
  // keep the button clickable so we can pulse-highlight the sound button and
  // explain the dependency via tooltip text.

  const MicIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );

  const SoundIconOn = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );

  const SoundIconOff = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );

  const SettingsIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );

  return (
    <>
      <aside className={`${styles.sidebar} ${isServerMode ? styles.sidebarServer : ""}`}>
      <div className={styles.sidebarInner}>

        <div className={`${styles.sidebarRow} ${styles.sidebarRowSearch}`}>
          <UserSearch />
        </div>

        <div className={styles.sidebarScroll}>

          {serverList.length > 0 && (
            <>
              <div className={`${styles.sidebarRow} ${styles.sidebarRowLabel}`}>
                <span className={styles.sidebarSectionLabel}>Servers</span>
              </div>
              {serverList.map((server) => {
                const active = isServerActive(server.id);
                return (
                  <div
                    key={`server-${server.id}`}
                    className={`${styles.sidebarRow} ${styles.sidebarRowItem} ${active ? styles.active : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveChat({ type: "server", serverId: server.id })}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      setActiveChat({ type: "server", serverId: server.id })
                    }
                  >
                    <div className={styles.sidebarCellAvatar}>
                      <Avatar 
                        name={server.name} 
                        size="medium" 
                        className={styles.serverAvatar}
                      />
                    </div>
                    <div className={`${styles.sidebarCellContent} conversation-cell`}>
                      <div className="conversation-top">
                        <span className="conversation-partner-id">{server.name}</span>
                        <span
                          className="conversation-time"
                          style={{ fontSize: "0.65rem", opacity: 0.55 }}
                        >
                          SERVER
                        </span>
                      </div>
                      <div className="conversation-bottom">
                        <span
                          className="conversation-last-msg"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Click to browse channels
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className={`${styles.sidebarRow} ${styles.sidebarRowLabel}`} style={{ paddingTop: 10 }}>
                <span className={styles.sidebarSectionLabel} style={{ opacity: 0.65 }}>Create</span>
              </div>
              <div className={`${styles.sidebarRow}`} style={{ padding: "0 14px 10px", gap: 10 }}>
                <PlusButton onClick={() => openModal("CREATE_PICKER")} />
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Add a server or group
                </div>
              </div>
            </>
          )}

          <div className={`${styles.sidebarRow} ${styles.sidebarRowLabel}`}>
            <span className={styles.sidebarSectionLabel}>Messages</span>
          </div>

          {allItems.length === 0 ? (
            <div className={`${styles.sidebarRow} ${styles.sidebarRowEmpty}`}>
              <p className="sidebar-empty">Search for a user above to start chatting.</p>
            </div>
          ) : (
            allItems.map((item) => {
              const isActive    = isItemActive(item);
              const previewText =
                item.preview.length > 40
                  ? item.preview.slice(0, 40) + "…"
                  : item.preview;
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  className={`${styles.sidebarRow} ${styles.sidebarRowItem} ${isActive ? styles.active : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleItemClick(item)}
                  onKeyDown={(e) => e.key === "Enter" && handleItemClick(item)}
                >
                  <div className={styles.sidebarCellAvatar}>
                    <div className="avatar-wrapper">
                      {item.kind === "room" ? (
                        <Avatar name="#" className="room-avatar" />
                      ) : (
                        <>
                          <Avatar name={item.name} />
                          {item.isOnline && <span className="online-dot" />}
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`${styles.sidebarCellContent} conversation-cell`}>
                    <div className="conversation-top">
                      <span className="conversation-partner-id">{item.name}</span>
                      <span className="conversation-time">
                        {formatPreviewTime(item.time)}
                      </span>
                    </div>
                    <div className="conversation-bottom">
                      <span className="conversation-last-msg">{previewText}</span>
                      {item.unread > 0 && (
                        <span className="unread-badge">{item.unread}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </aside>

    <div className={`${styles.sidebarUserPanel} ${isServerMode ? styles.sidebarUserPanelCollapsed : ""}`}>
      <div
        className={styles.sidebarUserPanelAvatarWrap}
        onClick={() => setShowProfile(true)}
        title="Открыть профиль"
      >
        <Avatar 
          name={displayName} 
          src={currentUser?.avatar_url} 
          className={styles.sidebarUserPanelAvatar}
        />
        <span
          className={`${styles.sidebarUserPanelStatus} ${isOnline ? styles.online : styles.offline}`}
          title={isOnline ? "Онлайн" : "Не в сети"}
        />
      </div>

      <div
        className={styles.sidebarUserPanelInfo}
        onClick={() => setShowProfile(true)}
        title="Открыть профиль"
      >
        <span className={styles.sidebarUserPanelName}>{displayName}</span>
        <span className={styles.sidebarUserPanelTag}>{statusLine}</span>
      </div>

      <div className={styles.sidebarUserPanelActions}>
        <button
          className={`${styles.sidebarUserPanelBtn} ${!micEnabled ? styles.iconBtnMuted : ""} ${(!soundEnabled || micCascaded) ? styles.iconBtnDisabled : ""}`}
          onClick={() => {
            if (!soundEnabled || micCascaded) {
              setSoundPulse(true);
              window.setTimeout(() => setSoundPulse(false), 600);
              return;
            }
            toggleMic();
          }}
          title={micTitle}
          aria-label={micTitle}
          aria-disabled={!soundEnabled || micCascaded}
          style={{ position: "relative" }}
        >
          {MicIcon}
          {!micEnabled && (
            <svg
              style={{ position: "absolute", top: 0, left: 0, width: 30, height: 30 }}
              viewBox="0 0 36 36"
            >
              <line x1="8" y1="8" x2="28" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <button
          className={`${styles.sidebarUserPanelBtn} ${!soundEnabled ? styles.iconBtnMuted : ""} ${soundPulse ? styles.soundPulse : ""}`}
          onClick={() => toggleSound()}
          title={soundTitle}
          aria-label={soundTitle}
          style={{ position: "relative" }}
        >
          {soundEnabled ? SoundIconOn : SoundIconOff}
        </button>
        <button
          className={styles.sidebarUserPanelBtn}
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          {SettingsIcon}
        </button>
      </div>
    </div>

    {/* модалки без изменений */}
    {activeModal === "CREATE_ROOM" && <CreateRoomModal onClose={closeModal} />}
    {activeModal === "CREATE_SERVER" && <CreateServerModal onClose={closeModal} />}
    {activeModal === "CREATE_PICKER" && (
      <CreatePickerModal
        onClose={closeModal}
        onPickServer={() => {
          openModal("CREATE_SERVER");
        }}
        onPickGroup={() => {
          openModal("CREATE_ROOM");
        }}
      />
    )}
    {showProfile && currentUser && (
      <ProfileModal user={currentUser} onClose={() => setShowProfile(false)} />
    )}
  </>
  );
}
