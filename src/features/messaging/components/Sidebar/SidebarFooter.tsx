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
    <div className="border-t border-border bg-card p-2">
      <div className="flex flex-col gap-2">
        {(callStatus === 'active' || callStatus === 'calling' || callStatus === 'ringing') && (
          <div className="flex items-center justify-between border border-border p-2 bg-background">
            <div className="flex items-center gap-2">
              <Rss className="h-4 w-4 text-online" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-online truncate">
                  {callStatus === 'active' ? 'Connected' : 
                   callStatus === 'calling' ? 'Calling...' : 'In-call'}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground truncate">{remoteUsername || "User"}</span>
                  {callStatus === 'active' && (
                    <span className="text-[10px] text-muted-foreground">({formatCallTime(callSeconds)})</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {callStatus === 'ringing' && (
                <>
                  <button 
                    onClick={onAcceptCall}
                    title="Accept"
                    className="flex h-7 w-7 items-center justify-center bg-online text-white"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={onRejectCall}
                    title="Reject"
                    className="flex h-7 w-7 items-center justify-center bg-destructive text-destructive-foreground"
                  >
                    <PhoneOff className="h-4 w-4" />
                  </button>
                </>
              )}

              {(callStatus === 'active' || callStatus === 'calling') && (
                <button 
                  onClick={() => callStatus === 'calling' ? onHangUp() : setConfirmHangUp(true)}
                  title="Hang up"
                  className="flex h-7 w-7 items-center justify-center bg-destructive text-destructive-foreground"
                >
                  <PhoneOff className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-1">
          <button 
            disabled 
            className="flex h-8 flex-1 items-center justify-center border border-border bg-background text-muted-foreground opacity-50"
          >
            <Video className="h-4 w-4" />
          </button>
          <button 
            disabled 
            className="flex h-8 flex-1 items-center justify-center border border-border bg-background text-muted-foreground opacity-50"
          >
            <MonitorUp className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between border border-border bg-background p-1.5">
          <div className="flex cursor-pointer items-center gap-2" onClick={() => setShowProfile(true)}>
            <Avatar 
              name={displayName} 
              src={currentUser?.avatar_url} 
              className="h-7 w-7 text-[10px]" 
              status={currentStatus as any}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-normal truncate">{displayName}</span>
              <span className={cn(
                "text-[10px] truncate",
                currentStatus === "online" ? "text-online" :
                currentStatus === "away" ? "text-away" :
                currentStatus === "dnd" ? "text-busy" :
                "text-muted-foreground"
              )}>{statusText}</span>
            </div>
          </div>
          
          <div className="flex items-center">
            <button 
              onClick={() => {
                toggleMic();
                if (callStatus === 'active' && onMuteToggle) {
                  onMuteToggle();
                }
              }}
              title="Mic"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-accent"
            >
              {isMicMuted ? <MicOff className="h-3.5 w-3.5 text-destructive" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
            <button 
              onClick={() => toggleSound()}
              title="Sound"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-accent"
            >
              {soundEnabled ? <Headphones className="h-3.5 w-3.5" /> : <HeadphoneOff className="h-3.5 w-3.5 text-destructive" />}
            </button>
            <button 
              onClick={onOpenSettings}
              title="Settings"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-accent"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {confirmHangUp && (
        <ConfirmModal
          title="Hang up?"
          message="End call?"
          confirmLabel="Hang up"
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
