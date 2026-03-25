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
      {/* 1. Sidebar Area (Sidebar + ChannelPanel + Partition) */}
      <div className="flex flex-shrink-0 h-full">
        <Sidebar
          isServerMode={showChannelPanel}
          onOpenSettings={() => setShowSettings(true)}
        />

        <div
          className={`flex-shrink-0 w-0 overflow-hidden transition-[width] duration-200 ease-in-out ${showChannelPanel ? "w-[352px]" : ""}`}
          aria-hidden={!showChannelPanel}
        >
          {persistedServerId !== null && (
            <ChannelPanel
              serverId={persistedServerId}
            />
          )}
        </div>
      </div>

      {/* 2. Content Area (Chat or Empty State) */}
      <div className="flex-1 flex overflow-hidden min-w-0">
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