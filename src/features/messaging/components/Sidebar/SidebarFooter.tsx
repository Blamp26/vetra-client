import { useMemo, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { Avatar } from "@/shared/components/Avatar";
import { IconButton } from "@/shared/components/IconButton";
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
  getPresenceText,
  resolvePresenceStatus,
} from "@/shared/utils/presence";
import { debugCall } from "@/features/calling/utils/callDebug";
import { getCallStatusLabel, normalizeCallIssue } from "@/features/calling/utils/callUxText";
import type { PersistentCallDirection } from "@/features/calling/components/PersistentCallSurface/PersistentCallViewModel";

interface SidebarFooterProps {
  callStatus: CallStatus;
  remoteUsername?: string | null;
  callSeconds: number;
  isMuted: boolean;
  isScreenSharing: boolean;
  isScreenShareUpdating: boolean;
  callIssue: CallIssue | null;
  isIncomingActionPending: boolean;
  onMuteToggle?: () => void;
  onHangUp?: () => void;
  onCancelCall?: () => void;
  onAcceptCall?: () => void;
  onRejectCall?: () => void;
  callDirection?: PersistentCallDirection;
  canCancelCall?: boolean;
  canHangUpCall?: boolean;
  onOpenSettings: () => void;
  onReturnToCall?: () => void;
  isCollapsed?: boolean;
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
  onCancelCall,
  onAcceptCall,
  onRejectCall,
  callDirection,
  canCancelCall,
  canHangUpCall,
  onOpenSettings,
  onReturnToCall,
  isCollapsed = false,
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

  const statusText = useMemo(
    () =>
      getPresenceText({
        status: currentStatus,
        lastSeenAt: currentUser?.last_seen_at,
      }),
    [currentStatus, currentUser?.last_seen_at],
  );

  const isMicMuted = callStatus === "active" ? isMuted : !micEnabled;
  const displayIssue = normalizeCallIssue(callIssue);
  const isIncomingCall = callStatus === "ringing" && (callDirection === "incoming" || callDirection === undefined);
  const isOutgoingCall = callDirection === "outgoing" && (callStatus === "calling" || callStatus === "ringing");
  const showLegacyCallingHangup = callDirection === undefined && callStatus === "calling";
  const showCancel = isOutgoingCall && canCancelCall === true;
  const showHangup = canHangUpCall ?? (callStatus === "active" || showLegacyCallingHangup);
  const callPanel = useMemo(() => {
    switch (callStatus) {
      case "calling":
        return {
          title: getCallStatusLabel({ status: callStatus }),
          subtitle: remoteUsername ? `Ringing ${remoteUsername}` : "Trying to reach the other user",
          tone: "default" as const,
        };
      case "ringing":
        if (!isIncomingCall) {
          return {
            title: getCallStatusLabel({ status: "calling" }),
            subtitle: remoteUsername ? `Ringing ${remoteUsername}` : "Trying to reach the other user",
            tone: "default" as const,
          };
        }
        return {
          title: getCallStatusLabel({ status: callStatus, isIncomingActionPending }),
          subtitle: remoteUsername ? `${remoteUsername} is calling` : "Someone is calling you",
          tone: "default" as const,
        };
      case "active":
        return {
          title: getCallStatusLabel({
            status: callStatus,
            diagnostics: {
              connectionState: "connected",
              iceConnectionState: "connected",
              iceGatheringState: "unknown",
              signalingState: "unknown",
              selectedLocalCandidateType: "unknown",
            },
            isScreenSharing,
            isScreenShareUpdating,
          }),
          subtitle: displayIssue?.message ?? `${remoteUsername || "User"} · ${formatCallTime(callSeconds)}`,
          tone: displayIssue?.tone ?? "default",
        };
      case "ended":
        return {
          title: getCallStatusLabel({ status: callStatus }),
          subtitle: remoteUsername ? `${remoteUsername}` : "The call has been closed",
          tone: "default" as const,
        };
      case "failed":
        return {
          title: getCallStatusLabel({ status: callStatus }),
          subtitle: displayIssue?.message ?? "Please try again.",
          tone: "error" as const,
        };
      default:
        return null;
    }
  }, [
    callSeconds,
    callStatus,
    displayIssue,
    isIncomingCall,
    isIncomingActionPending,
    isScreenShareUpdating,
    isScreenSharing,
    remoteUsername,
  ]);

  return (
    <div className={cn(
      "border-t border-border bg-[var(--vetra-shell-sidebar-bg)]",
      isCollapsed ? "px-3 py-3" : "px-4 py-3",
    )}>
      <div className="flex flex-col gap-2">
        {callPanel && (
          <div
            className={cn(
              "flex items-center justify-between rounded-[12px] border bg-card/90",
              isCollapsed ? "px-2 py-2" : "px-3 py-2.5",
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
                {!isCollapsed && (
                  <span className="text-xs text-foreground truncate">
                    {callPanel.subtitle}
                  </span>
                )}
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
                {!isCollapsed && (
                  <span className="text-xs text-foreground truncate">
                    {callPanel.subtitle}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1">
              {isIncomingCall && onAcceptCall && onRejectCall && (
                <>
                  <button
                  onClick={(event) => {
                      event.stopPropagation();
                      onAcceptCall?.();
                    }}
                    title="Accept call"
                    aria-label="Accept call"
                    className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-online text-white disabled:pointer-events-none disabled:opacity-60"
                    disabled={isIncomingActionPending}
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onRejectCall?.();
                    }}
                    title="Decline call"
                    aria-label="Decline call"
                    className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-destructive text-destructive-foreground disabled:pointer-events-none disabled:opacity-60"
                    disabled={isIncomingActionPending}
                  >
                    <PhoneOff className="h-4 w-4" />
                  </button>
                </>
              )}
              {(showCancel || showHangup) && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    showCancel ? onCancelCall?.() : setConfirmHangUp(true);
                  }}
                  title={showCancel ? "Cancel call" : "Hang up"}
                  aria-label={showCancel ? "Cancel call" : "Hang up"}
                  className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-destructive text-destructive-foreground"
                >
                  <PhoneOff className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className={cn(
          "flex items-center",
          isCollapsed ? "justify-center px-2 py-2" : "justify-between px-3 py-2.5",
        )} data-testid="sidebar-footer-identity-row">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-[10px] border-0 bg-transparent p-0 text-left text-foreground"
            aria-label={`Open profile for ${displayName}`}
            onClick={() => setShowProfile(true)}
            title={displayName}
          >
            <Avatar
              name={displayName}
              src={currentUser?.avatar_url}
              className="h-7 w-7 text-[10px]"
              status={currentStatus as any}
            />
            {!isCollapsed && (
              <div className="flex min-w-0 flex-col">
                <span className="text-xs font-normal truncate">
                  {displayName}
                </span>
                <span
                  data-testid="sidebar-footer-status"
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
            )}
          </button>

          <div className={cn("flex items-center gap-1", isCollapsed && "ml-2")}>
            <IconButton
              size="compact"
              tone={isMicMuted ? "danger" : "neutral"}
              label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              onClick={() => {
                toggleMic();
                if (callStatus === "active" && onMuteToggle) {
                  onMuteToggle();
                }
              }}
            >
              {isMicMuted ? (
                <MicOff className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </IconButton>
            <IconButton
              size="compact"
              tone={soundEnabled ? "neutral" : "danger"}
              label={
                callStatus === "active"
                  ? soundEnabled
                    ? "Mute call audio output"
                    : "Restore call audio output"
                  : soundEnabled
                    ? "Mute sound"
                    : "Restore sound"
              }
              title={
                callStatus === "active"
                  ? soundEnabled
                    ? "Mute call audio output"
                    : "Restore call audio output"
                  : soundEnabled
                    ? "Mute sound"
                    : "Restore sound"
              }
              onClick={() => toggleSound()}
            >
              {soundEnabled ? (
                <Headphones className="h-3.5 w-3.5" />
              ) : (
                <HeadphoneOff className="h-3.5 w-3.5 text-destructive" />
              )}
            </IconButton>
            <IconButton
              size="compact"
              label="Open settings"
              title="Open settings"
              onClick={onOpenSettings}
            >
              <Settings className="h-3.5 w-3.5" />
            </IconButton>
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
            onHangUp?.();
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
