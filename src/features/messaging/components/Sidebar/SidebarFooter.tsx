import { useMemo, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { Avatar } from "@/shared/components/Avatar";
import { cn } from "@/shared/utils/cn";
import {
  Settings,
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  Phone,
  PhoneOff,
} from "lucide-react";
import type { CallIssue, CallStatus } from "@/features/calling/hooks/useCall.types";
import { ProfileModal } from "@/features/profile/components/ProfileModal/ProfileModal";
import { ConfirmModal } from "@/shared/components/ConfirmModal/ConfirmModal";
import { formatCallTime } from "@/utils/formatDate";
import {
  getPresenceLabel,
  resolvePresenceStatus,
} from "@/shared/utils/presence";
import { debugCall } from "@/features/calling/utils/callDebug";

interface SidebarFooterProps {
  callStatus: CallStatus;
  remoteUsername?: string | null;
  callSeconds: number;
  isMuted: boolean;
  isScreenSharing: boolean;
  isScreenShareUpdating: boolean;
  callIssue: CallIssue | null;
  isIncomingActionPending: boolean;
  onMuteToggle: () => void;
  onHangUp: () => void;
  onAcceptCall: () => void;
  onRejectCall: () => void;
  onOpenSettings: () => void;
  onReturnToCall?: () => void;
}

export function SidebarFooter({
  callStatus,
  remoteUsername,
  callSeconds,
  isMuted,
  isScreenSharing,
  isScreenShareUpdating,
  callIssue,
  isIncomingActionPending,
  onMuteToggle,
  onHangUp,
  onAcceptCall,
  onRejectCall,
  onOpenSettings,
  onReturnToCall,
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
  const currentStatus = currentUser
    ? resolvePresenceStatus({
        userId,
        onlineUserIds,
        userStatuses,
        fallbackStatus: currentUser.status,
        lastSeenAt: currentUser.last_seen_at,
        preferFallbackStatusWhenUnknown: true,
      })
    : "offline";

  const statusText = useMemo(() => {
    if (!soundEnabled) return "Sound muted";
    if (!micEnabled) return "Microphone muted";

    return getPresenceLabel(currentStatus);
  }, [micEnabled, soundEnabled, currentStatus]);

  const isMicMuted = callStatus === "active" ? isMuted : !micEnabled;
  const callPanel = useMemo(() => {
    switch (callStatus) {
      case "calling":
        return {
          title: "Calling...",
          subtitle: remoteUsername ? `Ringing ${remoteUsername}` : "Trying to reach the other user",
          tone: "default" as const,
        };
      case "ringing":
        return {
          title: isIncomingActionPending ? "Connecting..." : "Incoming call",
          subtitle: remoteUsername ? `${remoteUsername} is calling` : "Someone is calling you",
          tone: "default" as const,
        };
      case "active":
        return {
          title: isScreenShareUpdating
            ? "Updating screen share..."
            : isScreenSharing
              ? "Screen sharing"
              : "Connected",
          subtitle: callIssue?.message ?? `${remoteUsername || "User"} · ${formatCallTime(callSeconds)}`,
          tone: callIssue?.tone ?? "default",
        };
      case "ended":
        return {
          title: "Call ended",
          subtitle: remoteUsername ? `${remoteUsername}` : "The call has been closed",
          tone: "default" as const,
        };
      case "failed":
        return {
          title: "Call failed",
          subtitle: callIssue?.message ?? "Please try again.",
          tone: "error" as const,
        };
      default:
        return null;
    }
  }, [
    callIssue,
    callSeconds,
    callStatus,
    isIncomingActionPending,
    isScreenShareUpdating,
    isScreenSharing,
    remoteUsername,
  ]);

  return (
    <div className="border-t border-border bg-card p-2">
      <div className="flex flex-col gap-2">
        {callPanel && (
          <div
            className={cn(
              "flex items-center justify-between border p-2 bg-background",
              callPanel.tone === "error" ? "border-destructive/50" : "border-border",
              callStatus === "active" && "cursor-pointer hover:bg-accent",
            )}
            data-testid={callStatus === "active" ? "sidebar-connected-call-block" : undefined}
            role={callStatus === "active" ? "button" : undefined}
            tabIndex={callStatus === "active" ? 0 : undefined}
            aria-label={
              callStatus === "active"
                ? `Return to call with ${remoteUsername || "current user"}`
                : undefined
            }
            title={callStatus === "active" ? "Return to active call" : undefined}
            onClick={() => {
              if (callStatus !== "active") return;
              debugCall("[SidebarFooter] connected call block clicked", {
                remoteUsername,
                hasReturnHandler: Boolean(onReturnToCall),
              });
              onReturnToCall?.();
            }}
            onKeyDown={(event) => {
              if (callStatus !== "active") return;
              if (event.target !== event.currentTarget) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              debugCall("[SidebarFooter] connected call block activated by keyboard", {
                remoteUsername,
                hasReturnHandler: Boolean(onReturnToCall),
              });
              onReturnToCall?.();
            }}
          >
            {callStatus === "active" ? (
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span
                  className={cn(
                    "text-xs uppercase",
                    callPanel.tone === "error" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {callPanel.title}
                </span>
                <span className="text-xs text-foreground truncate">
                  {callPanel.subtitle}
                </span>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "text-xs uppercase",
                    callPanel.tone === "error" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {callPanel.title}
                </span>
                <span className="text-xs text-foreground truncate">
                  {callPanel.subtitle}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1">
              {callStatus === "ringing" && (
                <>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onAcceptCall();
                    }}
                    title="Accept call"
                    className="flex h-7 w-7 items-center justify-center bg-online text-white disabled:pointer-events-none disabled:opacity-60"
                    disabled={isIncomingActionPending}
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onRejectCall();
                    }}
                    title="Decline call"
                    className="flex h-7 w-7 items-center justify-center bg-destructive text-destructive-foreground disabled:pointer-events-none disabled:opacity-60"
                    disabled={isIncomingActionPending}
                  >
                    <PhoneOff className="h-4 w-4" />
                  </button>
                </>
              )}
              {(callStatus === "active" || callStatus === "calling") && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    callStatus === "calling"
                      ? onHangUp()
                      : setConfirmHangUp(true);
                  }}
                  title="Hang up"
                  className="flex h-7 w-7 items-center justify-center bg-destructive text-destructive-foreground"
                >
                  <PhoneOff className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border border-border bg-background p-1.5">
          <div
            className="flex cursor-pointer items-center gap-2"
            onClick={() => setShowProfile(true)}
          >
            <Avatar
              name={displayName}
              src={currentUser?.avatar_url}
              className="h-7 w-7 text-[10px]"
              status={currentStatus as any}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-normal truncate">
                {displayName}
              </span>
              <span
                className={cn(
                  "text-[10px] truncate",
                  currentStatus === "online"
                    ? "text-online"
                    : currentStatus === "away"
                      ? "text-away"
                      : currentStatus === "dnd"
                        ? "text-busy"
                        : "text-muted-foreground",
                )}
              >
                {statusText}
              </span>
            </div>
          </div>

          <div className="flex items-center">
            <button
              onClick={() => {
                toggleMic();
                if (callStatus === "active" && onMuteToggle) {
                  onMuteToggle();
                }
              }}
              title="Mic"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-accent"
            >
              {isMicMuted ? (
                <MicOff className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => toggleSound()}
              title="Sound"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-accent"
            >
              {soundEnabled ? (
                <Headphones className="h-3.5 w-3.5" />
              ) : (
                <HeadphoneOff className="h-3.5 w-3.5 text-destructive" />
              )}
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
