import { useMemo, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { Avatar } from "@/shared/components/Avatar";
import { cn } from "@/shared/utils/cn";
import { Video, MonitorUp, Settings, Mic, MicOff, Headphones, HeadphoneOff, Phone, PhoneOff, Rss } from "lucide-react";
import type { CallStatus } from "@/features/calling/hooks/useCall.types";
import { ProfileModal } from "@/features/profile/components/ProfileModal/ProfileModal";
import { ConfirmModal } from "@/shared/components/ConfirmModal/ConfirmModal";
import { formatCallTime } from "@/utils/formatDate";

interface SidebarFooterProps {
  callStatus: CallStatus;
  remoteUsername?: string | null;
  callSeconds: number;
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
  callSeconds,
  isMuted,
  onMuteToggle,
  onHangUp,
  onAcceptCall,
  onRejectCall,
  onOpenSettings
}: SidebarFooterProps) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const onlineUserIds = useAppStore((s: RootState) => s.onlineUserIds);
  const userStatuses = useAppStore((s: RootState) => s.userStatuses);
  const micEnabled = useAppStore((s: RootState) => s.micEnabled);
  const soundEnabled = useAppStore((s: RootState) => s.soundEnabled);
  const toggleMic = useAppStore((s: RootState) => s.toggleMic);
  const toggleSound = useAppStore((s: RootState) => s.toggleSound);

  const [showProfile, setShowProfile] = useState(false);
  const [confirmHangUp, setConfirmHangUp] = useState(false);

  const displayName = currentUser?.display_name || currentUser?.username || "?";
  const userId = Number(currentUser?.id);
  const isOnline = currentUser ? onlineUserIds.has(userId) : false;
  const currentStatus = userStatuses[userId] || currentUser?.status || (isOnline ? "online" : "offline");

  const statusText = useMemo(() => {
    if (!soundEnabled) return "Sound muted";
    if (!micEnabled) return "Microphone muted";
    
    const statusMap: Record<string, string> = {
      online: "Online",
      away: "Away",
      dnd: "Do Not Disturb",
      offline: "Offline"
    };
    
    return statusMap[currentStatus] || "Offline";
  }, [micEnabled, soundEnabled, currentStatus]);

  const isMicMuted = callStatus === 'active' ? isMuted : !micEnabled;

  return (
    <div className="relative z-10 p-3">
      <div className="rounded-[1.6rem] border border-border/70 bg-card/85 p-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        {(callStatus === 'active' || callStatus === 'calling' || callStatus === 'ringing') && (
          <div className="mb-3 flex items-center justify-between rounded-[1.2rem] border border-border/70 bg-background/80 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-online/10 text-online">
                <Rss className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-online truncate">
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
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-online text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.96]"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button 
                    onClick={onRejectCall}
                    title="Reject call"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.96]"
                  >
                    <PhoneOff className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}

              {(callStatus === 'active' || callStatus === 'calling') && (
                <>
                  <div className="flex items-end gap-0.5 h-3 px-1">
                    <div className="w-0.5 bg-online rounded-full animate-pulse h-2 [animation-delay:100ms] [animation-duration:400ms]"></div>
                    <div className="w-0.5 bg-online rounded-full animate-pulse h-3 [animation-delay:200ms] [animation-duration:400ms]"></div>
                    <div className="w-0.5 bg-online rounded-full animate-pulse h-1.5 [animation-delay:300ms] [animation-duration:400ms]"></div>
                  </div>
                  <button 
                    onClick={() => callStatus === 'calling' ? onHangUp() : setConfirmHangUp(true)}
                    title="End call"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.96]"
                  >
                    <PhoneOff className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="mb-3 flex gap-1.5">
          <button 
            disabled 
            title="Video call — coming soon"
            className="flex h-9 flex-1 cursor-not-allowed items-center justify-center rounded-[1rem] border border-border/60 bg-background/80 text-muted-foreground opacity-50"
          >
            <Video className="h-4 w-4" aria-hidden="true" />
          </button>
          <button 
            disabled 
            title="Screen share — coming soon"
            className="flex h-9 flex-1 cursor-not-allowed items-center justify-center rounded-[1rem] border border-border/60 bg-background/80 text-muted-foreground opacity-50"
          >
            <MonitorUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-[1.2rem] border border-border/70 bg-background/80 px-2 py-1.5">
          <div className="flex cursor-pointer items-center gap-2" onClick={() => setShowProfile(true)}>
            <Avatar 
              name={displayName} 
              src={currentUser?.avatar_url} 
              className="h-7 w-7 text-[10px] shadow-[0_12px_24px_-20px_rgba(15,23,42,0.35)]" 
              status={currentStatus as any}
            />
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-medium text-card-foreground truncate">{displayName}</span>
              <div className="flex items-center gap-1 text-[10px]">
                <span className={cn(
                  "truncate transition-colors",
                  currentStatus === "online" ? "text-online" :
                  currentStatus === "away" ? "text-away" :
                  currentStatus === "dnd" ? "text-busy" :
                  "text-muted-foreground"
                )}>{statusText}</span>
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
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground active:translate-y-0 active:scale-[0.96]"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground active:translate-y-0 active:scale-[0.96]"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground active:translate-y-0 active:scale-[0.96]"
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
