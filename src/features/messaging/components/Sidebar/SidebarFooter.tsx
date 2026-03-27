import { useEffect, useMemo, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { Avatar } from "@/shared/components/Avatar";
import { Video, MonitorUp, Settings, Mic, MicOff, Headphones, HeadphoneOff, Phone, PhoneOff, Rss } from "lucide-react";
import type { CallStatus } from "@/features/calling/hooks/useCall.types";
import { ProfileModal } from "@/features/profile/components/ProfileModal/ProfileModal";
import { ConfirmModal } from "@/shared/components/ConfirmModal/ConfirmModal";

interface SidebarFooterProps {
  callStatus: CallStatus;
  remoteUsername?: string | null;
  isMuted: boolean;
  onMuteToggle: () => void;
  onHangUp: () => void;
  onAcceptCall: () => void;
  onRejectCall: () => void;
  onOpenSettings: () => void;
}

export function SidebarFooter({
  callStatus,
  remoteUsername,
  isMuted,
  onMuteToggle,
  onHangUp,
  onAcceptCall,
  onRejectCall,
  onOpenSettings
}: SidebarFooterProps) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const onlineUserIds = useAppStore((s: RootState) => s.onlineUserIds);
  const micEnabled = useAppStore((s: RootState) => s.micEnabled);
  const soundEnabled = useAppStore((s: RootState) => s.soundEnabled);
  const toggleMic = useAppStore((s: RootState) => s.toggleMic);
  const toggleSound = useAppStore((s: RootState) => s.toggleSound);

  const [showProfile, setShowProfile] = useState(false);
  const [confirmHangUp, setConfirmHangUp] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  // Timer for active call
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStatus === 'active') {
      interval = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setCallSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus]);

  const formatCallTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const displayName = currentUser?.display_name || currentUser?.username || "?";
  const isOnline = currentUser ? onlineUserIds.has(Number(currentUser.id)) : false;

  const statusText = useMemo(() => {
    if (!soundEnabled) return "Sound muted";
    if (!micEnabled) return "Microphone muted";
    return isOnline ? "Online" : "Offline";
  }, [isOnline, micEnabled, soundEnabled]);

  const isMicMuted = callStatus === 'active' ? isMuted : !micEnabled;

  return (
    <div className="relative z-10 p-3">
      <div className="rounded-xl bg-card shadow-lg ring-1 ring-border p-3">
        {/* Voice Status (Visible during call) */}
        {(callStatus === 'active' || callStatus === 'calling' || callStatus === 'ringing') && (
          <div className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <Rss className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-emerald-500 truncate">
                  {callStatus === 'active' ? 'Voice Connected' : 
                   callStatus === 'calling' ? 'Calling...' : 'Incoming call'}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground truncate">{remoteUsername || "Unknown User"}</span>
                  {callStatus === 'active' && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">({formatCallTime(callSeconds)})</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {callStatus === 'ringing' && (
                <>
                  <button 
                    onClick={onAcceptCall}
                    title="Accept call"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-white transition-all hover:brightness-110 active:scale-90"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button 
                    onClick={onRejectCall}
                    title="Reject call"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-all hover:brightness-110 active:scale-90"
                  >
                    <PhoneOff className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}

              {(callStatus === 'active' || callStatus === 'calling') && (
                <>
                  <div className="flex items-end gap-0.5 h-3 px-1">
                    <div className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{ height: "8px", animationDelay: "100ms", animationDuration: "400ms" }}></div>
                    <div className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{ height: "12px", animationDelay: "200ms", animationDuration: "400ms" }}></div>
                    <div className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{ height: "6px", animationDelay: "300ms", animationDuration: "400ms" }}></div>
                  </div>
                  <button 
                    onClick={() => callStatus === 'calling' ? onHangUp() : setConfirmHangUp(true)}
                    title="End call"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-all hover:brightness-110 active:scale-90"
                  >
                    <PhoneOff className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-1.5 mb-3">
          <button 
            disabled 
            title="Video call — coming soon"
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Video className="h-4 w-4" aria-hidden="true" />
          </button>
          <button 
            disabled 
            title="Screen share — coming soon"
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <MonitorUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* User Profile & Controls */}
        <div className="flex items-center justify-between rounded-lg bg-muted px-2 py-1.5">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowProfile(true)}>
            <Avatar 
              name={displayName} 
              src={currentUser?.avatar_url} 
              className="h-7 w-7 text-[10px]" 
              status={isOnline ? "online" : "offline"}
            />
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-medium text-card-foreground truncate">{displayName}</span>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="truncate">{statusText}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-0.5">
            <button 
              onClick={() => {
                toggleMic();
                if (callStatus === 'active' && onMuteToggle) {
                  onMuteToggle();
                }
              }}
              title={!isMicMuted ? "Mute microphone" : "Unmute microphone"}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {isMicMuted ? (
                <MicOff className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
              ) : (
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            <button 
              onClick={() => toggleSound()}
              title={soundEnabled ? "Mute sound" : "Unmute sound"}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {soundEnabled ? (
                <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <HeadphoneOff className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
              )}
            </button>
            <button 
              onClick={onOpenSettings}
              title="User settings"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {confirmHangUp && (
        <ConfirmModal
          title="Завершить звонок?"
          message="Это прервёт активное соединение."
          confirmLabel="Завершить"
          isDanger
          onConfirm={() => {
            setConfirmHangUp(false);
            onHangUp();
          }}
          onCancel={() => setConfirmHangUp(false)}
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
