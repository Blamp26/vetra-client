import { useState, useRef } from "react";
import { useAppStore } from "@/store";
import { AuthPage } from "@/features/registration/AuthPage";
import { Sidebar } from "@/features/messaging/components/Sidebar";
import { ChatWindow } from "@/features/messaging/components/ChatWindow/ChatWindow";
import { ChannelPanel } from "@/features/messaging/components/ChannelPanel/ChannelPanel";
import { SettingsPage } from "@/features/settings/components/SettingsPage/SettingsPage";
import { useSocketEvents } from "@/features/messaging/hooks/useSocketEvents";
import { useAuthHydration } from "@/shared/hooks/useAuthHydration";
import { useCall } from './features/calling/hooks/useCall';
import { ActiveCallWindow } from './features/calling/components/ActiveCallWindow';
import { IncomingCallModal } from './features/calling/components/IncomingCallModal';
import { ToastHost } from "@/shared/components/ToastHost/ToastHost";

function App() {
  const currentUser = useAppStore((s) => s.currentUser);
  const { status, remoteUserId, remoteStream, remoteUsername, isMuted, toggleMute, hangUp, acceptCall, rejectCall, startCall } = useCall(currentUser?.id ?? 0);
  const activeChat = useAppStore((s) => s.activeChat);

  const [showSettings, setShowSettings] = useState(false);

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
    <>
      <div className="app-layout">
        <Sidebar
          isServerMode={showChannelPanel}
          onOpenSettings={() => setShowSettings(true)}
        />

        {/*
          The slot controls visibility via CSS width (0 → 352px).
          The ChannelPanel itself is never torn down once a server has been
          visited — it is reused and repositioned by the slot's transition.
          No new instance is created on each chat-to-server transition.
        */}
        <div
          className={`channel-panel-slot${showChannelPanel ? " is-visible" : ""}`}
          aria-hidden={!showChannelPanel}
        >
          {persistedServerId !== null && (
            <ChannelPanel
              serverId={persistedServerId}
            />
          )}
        </div>

        <main className="main-content">
          {chatTarget ? (
            <ChatWindow 
              activeChat={chatTarget} 
              callStatus={status}
              onStartCall={startCall}
            />
          ) : activeChat?.type === "server" ? (
            <div className="empty-state">
              <div className="empty-state-inner">
                <span className="empty-icon">📢</span>
                <h2>Select a channel</h2>
                <p>Pick a channel from the panel on the left to start chatting.</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-inner">
                <span className="empty-icon">💬</span>
                <h2>Select a conversation</h2>
                <p>Choose a chat from the sidebar or search for a user.</p>
              </div>
            </div>
          )}
        </main>
      </div>

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

      {status === 'active' && remoteUsername && (
        <ActiveCallWindow
          remoteStream={remoteStream}
          remoteUsername={remoteUsername}
          isMuted={isMuted}
          onMuteToggle={toggleMute}
          onHangUp={hangUp}
        />
      )}

      <ToastHost />
    </>
  );
}

export default App;