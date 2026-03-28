import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store";
import { AuthPage } from "@/features/registration/AuthPage";
import { Sidebar } from "@/features/messaging/components/Sidebar";
import { SidebarFooter } from "@/features/messaging/components/Sidebar/SidebarFooter";
import { ChatWindow } from "@/features/messaging/components/ChatWindow/ChatWindow";
import { ChannelPanel } from "@/features/messaging/components/ChannelPanel/ChannelPanel";
import { SettingsPage } from "@/features/settings/components/SettingsPage/SettingsPage";
import { useSocketEvents } from "@/features/messaging/hooks/useSocketEvents";
import { useAuthHydration } from "@/shared/hooks/useAuthHydration";
import { useCall } from './features/calling/hooks/useCall';

import { IncomingCallModal } from './features/calling/components/IncomingCallModal';
import { ActiveCallWindow } from './features/calling/components/ActiveCallWindow';
import { ToastHost } from "@/shared/components/ToastHost/ToastHost";

function App() {
  const currentUser = useAppStore((s) => s.currentUser);
  const { status, remoteStream, remoteUsername, remoteUserId, isMuted, seconds, toggleMute, hangUp, acceptCall, rejectCall, startCall } = useCall(currentUser?.id ?? 0);
  const activeChat = useAppStore((s) => s.activeChat);
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const openModal = useAppStore((s) => s.openModal);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [showSettings, setShowSettings] = useState(false);

  // ── URL Synchronization ──────────────────────────────────────────────────
  useEffect(() => {
    const syncUrlToStore = () => {
      const hash = window.location.hash;
      if (!hash || hash === '#') return;

      // Format: #/ID (direct), #/r/ID (room), #/s/SID/CID (server/channel)
      const parts = hash.replace('#/', '').split('/');
      const p1 = parts[0];
      const id1 = Number(p1);

      if (!isNaN(id1)) {
        setActiveChat({ type: 'direct', partnerId: id1 });
      } else if (p1 === 'r' && parts[1]) {
        setActiveChat({ type: 'room', roomId: Number(parts[1]) });
      } else if (p1 === 's' && parts[1]) {
        if (parts[2]) {
          setActiveChat({ type: 'channel', serverId: Number(parts[1]), channelId: Number(parts[2]) });
        } else {
          setActiveChat({ type: 'server', serverId: Number(parts[1]) });
        }
      } else if (p1 === 'settings') {
        setShowSettings(true);
      }
    };

    syncUrlToStore();
    window.addEventListener('hashchange', syncUrlToStore);
    return () => window.removeEventListener('hashchange', syncUrlToStore);
  }, [setActiveChat]);

  useEffect(() => {
    if (!activeChat) {
      if (window.location.hash && !showSettings) {
        // Only clear hash if it wasn't a settings hash
        // window.history.replaceState(null, '', window.location.pathname);
      }
      return;
    }

    let newHash = '';
    switch (activeChat.type) {
      case 'direct':  newHash = `#/${activeChat.partnerId}`; break;
      case 'room':    newHash = `#/r/${activeChat.roomId}`; break;
      case 'server':  newHash = `#/s/${activeChat.serverId}`; break;
      case 'channel': newHash = `#/s/${activeChat.serverId}/${activeChat.channelId}`; break;
      case 'settings': newHash = `#/settings`; break;
    }

    if (newHash && window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [activeChat, showSettings]);

  useEffect(() => {
    if (showSettings && window.location.hash !== '#/settings') {
      window.history.replaceState(null, '', '#/settings');
    } else if (!showSettings && window.location.hash === '#/settings') {
      // If settings closed but hash is still settings, go back to active chat hash or clear
      if (activeChat) {
        let newHash = '';
        switch (activeChat.type) {
          case 'direct':  newHash = `#/${activeChat.partnerId}`; break;
          case 'room':    newHash = `#/r/${activeChat.roomId}`; break;
          case 'server':  newHash = `#/s/${activeChat.serverId}`; break;
          case 'channel': newHash = `#/s/${activeChat.serverId}/${activeChat.channelId}`; break;
        }
        window.history.replaceState(null, '', newHash || '#');
      } else {
        window.history.replaceState(null, '', '#');
      }
    }
  }, [showSettings, activeChat]);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useAuthHydration();
  useSocketEvents();

  // Persist the last valid server ID so the ChannelPanel instance is never
  // unmounted when the user navigates away from a server view back to a DM/room.
  // The panel stays mounted (hidden by CSS) and is simply repositioned/revealed
  // on the next server transition — no duplicate creation, no state reset.
  const lastServerIdRef = useRef<number | null>(null);

  const showChannelPanel =
    activeChat?.type === "server" || activeChat?.type === "channel";

  const channelPanelServerId =
    activeChat?.type === "server" ? activeChat.serverId :
      activeChat?.type === "channel" ? activeChat.serverId :
        null;

  // Track the latest server ID so we can keep the panel alive when
  // channelPanelServerId becomes null (DM / group chat active).
  if (channelPanelServerId !== null) {
    lastServerIdRef.current = channelPanelServerId;
  }
  const persistedServerId = lastServerIdRef.current;

  const chatTarget =
    activeChat?.type === "channel"
      ? { type: "room" as const, roomId: activeChat.channelId }
      : activeChat?.type === "server"
        ? null
        : activeChat;

  if (!currentUser) {
    return <AuthPage />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Audio element for calls */}
      <audio
        ref={audioRef}
        autoPlay
        hidden
      />

      {/* 1. Sidebar Area (Sidebar + ChannelPanel + Partition) */}
      <div className="relative flex flex-col flex-shrink-0 h-full border-r border-border bg-sidebar w-[432px] z-20">
        {showChannelPanel && (
          <div className="absolute left-[71px] top-0 bottom-0 w-[1px] bg-border pointer-events-none z-0" />
        )}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar
            isServerMode={showChannelPanel}
          />

          <div
            className={`flex-shrink-0 w-0 overflow-hidden ${showChannelPanel ? "w-[360px]" : ""}`}
            aria-hidden={!showChannelPanel}
          >
            {persistedServerId !== null && (
              <ChannelPanel
                serverId={persistedServerId}
              />
            )}
          </div>
        </div>

        <SidebarFooter
          callStatus={status}
          remoteUsername={remoteUsername}
          callSeconds={seconds}
          isMuted={isMuted}
          onMuteToggle={toggleMute}
          onHangUp={hangUp}
          onAcceptCall={acceptCall}
          onRejectCall={rejectCall}
          onOpenSettings={() => setShowSettings(true)}
        />
      </div>

      {/* 2. Content Area (Chat or Empty State) */}
      <div className="flex-1 flex overflow-hidden min-w-0 relative z-10">
        {chatTarget ? (
          <ChatWindow 
            activeChat={chatTarget} 
            callStatus={status}
            onStartCall={startCall}
          />
        ) : activeChat?.type === "server" ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-background min-w-0">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <span className="text-[2rem] block">📢</span>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">
                  Select a channel
                </h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Pick a channel from the panel on the left to start chatting.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-background min-w-0">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="h-8 w-8 text-muted-foreground"
                >
                  <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>
                </svg>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">
                  Select a conversation
                </h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Choose a chat from the sidebar or search for a user to start messaging
                </p>
                <button
                  onClick={() => openModal("CREATE_PICKER")}
                  className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                >
                  Start a new conversation
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Overlays (Fixed components inside root) */}
      {showSettings && (
        <SettingsPage onClose={() => setShowSettings(false)} />
      )}

      {status === 'ringing' && (
        <IncomingCallModal
          callerName={remoteUsername ?? `User #${remoteUserId}`}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {status === 'active' && (
        <ActiveCallWindow
          remoteStream={remoteStream}
          remoteUsername={remoteUsername ?? `User #${remoteUserId}`}
          seconds={seconds}
          isMuted={isMuted}
          onMuteToggle={toggleMute}
          onHangUp={hangUp}
        />
      )}

      <ToastHost />
    </div>
  );
}

export default App;