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

function EmptyState({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  mode,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  mode: "channel" | "conversation";
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-8 py-10">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/75 p-8 shadow-[0_32px_90px_-52px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.28),transparent_70%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_70%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_18rem] lg:items-center">
          <div className="space-y-4">
            <span className="inline-flex items-center rounded-full border border-border/80 bg-background/80 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </span>
            <div className="space-y-3">
              <h2 className="max-w-lg text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem] sm:leading-[1.02]">
                {title}
              </h2>
              <p className="max-w-[34rem] text-sm leading-6 text-muted-foreground sm:text-[15px]">
                {description}
              </p>
            </div>
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0 active:scale-[0.98]"
              >
                {actionLabel}
              </button>
            )}
          </div>
          <div className="relative ml-auto hidden w-full max-w-[18rem] lg:block">
            <div className="absolute inset-x-6 top-3 h-32 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-border/70 bg-background/90 p-4 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between rounded-[1.35rem] border border-border/60 bg-card px-4 py-3">
                <div className="space-y-2">
                  <div className="h-2.5 w-16 rounded-full bg-foreground/10" />
                  <div className="h-2 w-24 rounded-full bg-foreground/6" />
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-primary text-base font-semibold text-primary-foreground">
                  {mode === "channel" ? "#" : "+"}
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[1.35rem] border border-border/60 bg-card px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-2.5 w-24 rounded-full bg-foreground/10" />
                      <div className="h-2 w-32 rounded-full bg-foreground/6" />
                    </div>
                    <div className="h-6 w-10 rounded-full bg-primary/10" />
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-dashed border-border/70 bg-card/70 px-4 py-4">
                  <div className="space-y-2">
                    <div className="h-2.5 w-20 rounded-full bg-foreground/10" />
                    <div className="h-2 w-full rounded-full bg-foreground/6" />
                    <div className="h-2 w-4/5 rounded-full bg-foreground/6" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div className="relative flex min-h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-[24rem] w-[24rem] rounded-full bg-primary/6 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[26rem] w-[26rem] rounded-full bg-foreground/[0.035] blur-3xl dark:bg-white/[0.04]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_24%,transparent_76%,rgba(255,255,255,0.08))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_28%,transparent_76%,rgba(255,255,255,0.02))]" />
      </div>
      <audio
        ref={audioRef}
        autoPlay
        hidden
      />
      <div className="relative flex min-h-[100dvh] w-full overflow-hidden">
      <div className="relative z-20 flex h-full w-[432px] flex-shrink-0 flex-col border-r border-border/70 bg-sidebar/90 shadow-[24px_0_80px_-48px_rgba(15,23,42,0.35)] backdrop-blur-xl">
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
      <div className="relative z-10 flex min-w-0 flex-1 overflow-hidden">
        {chatTarget ? (
          <ChatWindow 
            activeChat={chatTarget} 
            callStatus={status}
            onStartCall={startCall}
          />
        ) : activeChat?.type === "server" ? (
          <EmptyState
            eyebrow="Workspace"
            title="Choose a channel to open the conversation thread."
            description="Your server panel stays pinned on the left. Open any channel to jump straight into messages, files, and presence updates without switching screens."
            mode="channel"
          />
        ) : (
          <EmptyState
            eyebrow="Inbox"
            title="Pick a conversation or start a new one from the sidebar."
            description="Recent chats, rooms, and server channels stay organized in one place. Use search or create a new thread when you want to reach someone faster."
            actionLabel="Start a new conversation"
            onAction={() => openModal("CREATE_PICKER")}
            mode="conversation"
          />
        )}
      </div>
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
