import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize, Mic, MicOff, Minimize, MonitorUp, MonitorX, PhoneOff } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatCallTime } from "@/utils/formatDate";
import type { CallDiagnostics, CallIssue, CallStatus } from "@/features/calling/hooks/useCall.types";
import { getCallStatusLabel, normalizeCallIssue } from "@/features/calling/utils/callUxText";
import { detachVideo, safelyPlayVideo } from "./mediaVideo";
import type { ResourceRef, User } from "@/shared/types";
import { serializeResourceRef } from "@/shared/utils/resourceRef";
import { useAppStore } from "@/store";
import { UserContextMenu, type UserContextTarget } from "@/features/users/components/UserContextMenu/UserContextMenu";
import { UserProfileDialog } from "@/features/users/components/UserProfileDialog/UserProfileDialog";
import { UserNoteDialog } from "@/features/users/components/UserNoteDialog/UserNoteDialog";
import { getUserNotes, saveUserNote } from "@/features/users/utils/userNotes";
import type { UserContextInvocation } from "@/features/users/components/UserContextMenu/UserContextMenu";
import { VolumeX } from "lucide-react";

function isTauriDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function copyText(value: string, title: string, onSuccess: () => void): void {
  void Promise.resolve()
    .then(() => navigator.clipboard?.writeText(value) ?? Promise.reject(new Error("Clipboard unavailable")))
    .then(() => {
      window.dispatchEvent(new CustomEvent("vetra:toast", { detail: { title, body: value, durationMs: 3000 } }));
      onSuccess();
    })
    .catch(() => {
      window.dispatchEvent(new CustomEvent("vetra:toast", { detail: { title: `Could not copy ${title === "Username copied" ? "username" : "user ID"}`, body: "Clipboard access was unavailable.", durationMs: 4000 } }));
    });
}

interface ActiveCallDockProps {
  currentUser?: User | null;
  remoteUserId?: ResourceRef | null;
  remoteUser?: User | null;
  remoteUsername: string;
  callStatus?: CallStatus;
  seconds: number;
  isMuted: boolean;
  isScreenSharing: boolean;
  isScreenShareUpdating: boolean;
  isRemoteScreenLoading: boolean;
  isRemoteScreenAvailable: boolean;
  isWatchingRemoteScreen: boolean;
  callIssue: CallIssue | null;
  remoteScreenStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  diagnostics: CallDiagnostics;
  onMuteToggle: () => void;
  onStartScreenShare: () => Promise<void>;
  onStopScreenShare: () => void;
  onWatchRemoteScreen: () => Promise<void>;
  onHangUp: () => void;
}

function StreamVideo({
  stream,
  label,
  className,
  muted = true,
  testId,
}: {
  stream: MediaStream | null;
  label: string;
  className: string;
  muted?: boolean;
  testId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void safelyPlayVideo(video, label);
    else detachVideo(video);
    return () => detachVideo(video);
  }, [label, stream]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      data-testid={testId}
    />
  );
}

export function ActiveCallDock({
  currentUser,
  remoteUserId,
  remoteUser,
  remoteUsername,
  callStatus = "active",
  seconds,
  isMuted,
  isScreenSharing,
  isScreenShareUpdating,
  isRemoteScreenLoading,
  isRemoteScreenAvailable,
  isWatchingRemoteScreen,
  callIssue,
  remoteScreenStream,
  localScreenStream,
  diagnostics,
  onMuteToggle,
  onStartScreenShare,
  onStopScreenShare,
  onWatchRemoteScreen,
  onHangUp,
}: ActiveCallDockProps) {
  const callUserVolumes = useAppStore((s) => s.callUserVolumes) ?? {};
  const mutedCallUserIds = useAppStore((s) => s.mutedCallUserIds) ?? {};
  const setCallUserVolume = useAppStore((s) => s.setCallUserVolume);
  const setCallUserMuted = useAppStore((s) => s.setCallUserMuted);
  const [contextRequest, setContextRequest] = useState<{ target: UserContextTarget; invocation: UserContextInvocation } | null>(null);
  const [profileTarget, setProfileTarget] = useState<UserContextTarget | null>(null);
  const [noteTarget, setNoteTarget] = useState<UserContextTarget | null>(null);
  const [userNotes, setUserNotes] = useState(getUserNotes);
  const contextTriggerRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const isMountedRef = useRef(true);
  const nativeFullscreenOwnedRef = useRef(false);
  const fullscreenPresentationRef = useRef<"share" | "voice" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenPending, setIsFullscreenPending] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isShareExpanded, setIsShareExpanded] = useState(false);
  const [isRemoteWatchPending, setIsRemoteWatchPending] = useState(false);
  const [fullscreenRoot, setFullscreenRoot] = useState<HTMLDivElement | null>(null);
  const displayIssue = normalizeCallIssue(callIssue);
  const hasScreenShare = isRemoteScreenAvailable || Boolean(localScreenStream) || isScreenSharing;
  const statusLabel = getCallStatusLabel({
    status: callStatus,
    diagnostics,
    isScreenSharing,
    isScreenShareUpdating,
  });
  const shouldShowDiagnostics =
    import.meta.env.DEV && import.meta.env.VITE_WEBRTC_SHOW_DIAGNOSTICS === "true";
  const remoteAudioPreferenceKey = remoteUserId == null ? undefined : serializeResourceRef(remoteUserId);
  const remoteTarget: UserContextTarget = { profileId: remoteUser?.public_id ?? remoteUserId ?? "", copyId: remoteUser?.public_id ?? remoteUserId ?? "", audioPreferenceKey: remoteAudioPreferenceKey, username: remoteUser?.username ?? remoteUsername, displayName: remoteUser?.display_name, avatarUrl: remoteUser?.avatar_url, kind: "remote" };
  const selfTarget: UserContextTarget = { profileId: currentUser?.public_id ?? currentUser?.id ?? "", copyId: currentUser?.public_id ?? currentUser?.id ?? "", username: currentUser?.username ?? "You", displayName: currentUser?.display_name, avatarUrl: currentUser?.avatar_url, kind: "self" };
  const remoteMutedLocally = Boolean(remoteAudioPreferenceKey && mutedCallUserIds[remoteAudioPreferenceKey]);
  const openUserContext = (event: React.MouseEvent | React.KeyboardEvent, target: UserContextTarget) => {
    event.preventDefault();
    event.stopPropagation();
    contextTriggerRef.current = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if ("clientX" in event) setContextRequest({ target, invocation: { mode: "pointer", clientX: event.clientX, clientY: event.clientY } });
    else setContextRequest({ target, invocation: { mode: "keyboard", anchorRect: event.currentTarget.getBoundingClientRect() } });
  };
  const closeUserContext = () => {
    setContextRequest(null);
    const trigger = contextTriggerRef.current;
    contextTriggerRef.current = null;
    if (trigger?.isConnected) trigger.focus();
  };
  useEffect(() => { closeUserContext(); setProfileTarget(null); setNoteTarget(null); }, [remoteUserId]);


  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined") return;

    const root = document.createElement("div");
    root.id = "vetra-call-fullscreen-root";
    root.className = "vetra-call-fullscreen-root";
    document.body.appendChild(root);
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setFullscreenRoot(root);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      setFullscreenRoot((currentRoot) => (currentRoot === root ? null : currentRoot));
      root.remove();
    };
  }, [isFullscreen]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!isTauriDesktopRuntime()) return () => { isMountedRef.current = false; };

    void getCurrentWindow().isFullscreen()
      .then((fullscreen) => {
        if (isMountedRef.current) setIsFullscreen(fullscreen);
      })
      .catch((error: unknown) => {
        console.warn("[ActiveCallDock] Failed to read native fullscreen state", error);
      });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauriDesktopRuntime()) return;

    let disposed = false;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    let unlistenResize: (() => void) | null = null;
    let unlistenFocus: (() => void) | null = null;
    const currentWindow = getCurrentWindow();

    const synchronizeNativeFullscreen = () => {
      if (disposed) return;
      if (syncTimer !== null) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void currentWindow.isFullscreen()
          .then((fullscreen) => {
            if (disposed || !isMountedRef.current || fullscreen) return;
            nativeFullscreenOwnedRef.current = false;
            fullscreenPresentationRef.current = null;
            setIsFullscreenPending(false);
            setIsFullscreen(false);
          })
          .catch((error: unknown) => {
            if (!disposed) console.warn("[ActiveCallDock] Failed to synchronize native fullscreen state", error);
          });
      }, 50);
    };

    const registerNativeListeners = async () => {
      try {
        const [resizeUnlisten, focusUnlisten] = await Promise.all([
          currentWindow.onResized(synchronizeNativeFullscreen),
          currentWindow.onFocusChanged(synchronizeNativeFullscreen),
        ]);
        if (disposed || !isMountedRef.current) {
          resizeUnlisten();
          focusUnlisten();
          return;
        }
        unlistenResize = resizeUnlisten;
        unlistenFocus = focusUnlisten;
      } catch (error) {
        if (!disposed) console.warn("[ActiveCallDock] Failed to subscribe to native fullscreen events", error);
      }
    };

    void registerNativeListeners();
    return () => {
      disposed = true;
      if (syncTimer !== null) clearTimeout(syncTimer);
      unlistenResize?.();
      unlistenFocus?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauriDesktopRuntime()) return;
    return () => {
      const currentWindow = getCurrentWindow();
      if (!nativeFullscreenOwnedRef.current) return;
      nativeFullscreenOwnedRef.current = false;
      void (async () => {
        try {
          await currentWindow.setFullscreen(false);
        } catch (error) {
          console.warn("[ActiveCallDock] Failed to exit native fullscreen during cleanup", error);
        }
      })();
    };
  }, []);

  const exitFullscreen = async () => {
    if (isFullscreenPending) return;
    setIsFullscreenPending(true);
    try {
      if (isTauriDesktopRuntime()) {
        const currentWindow = getCurrentWindow();
        await currentWindow.setFullscreen(false);
        const fullscreen = await currentWindow.isFullscreen();
        nativeFullscreenOwnedRef.current = fullscreen;
        if (!fullscreen) fullscreenPresentationRef.current = null;
        if (isMountedRef.current) setIsFullscreen(fullscreen);
      }
    } catch (error) {
      if (isTauriDesktopRuntime()) {
        try {
          const currentWindow = getCurrentWindow();
          const fullscreen = await currentWindow.isFullscreen();
          if (!fullscreen) {
            nativeFullscreenOwnedRef.current = false;
            fullscreenPresentationRef.current = null;
          }
          if (isMountedRef.current) setIsFullscreen(fullscreen);
        } catch (syncError) {
          console.warn("[ActiveCallDock] Failed to synchronize native fullscreen state", syncError);
        }
      }
      console.warn("[ActiveCallDock] Failed to exit fullscreen", error);
    } finally {
      if (isMountedRef.current) setIsFullscreenPending(false);
    }
  };

  useEffect(() => {
    if (callStatus !== "active") {
      setIsFullscreen(false);
      setControlsVisible(false);
      setIsShareExpanded(false);
      if (isTauriDesktopRuntime()) {
        if (nativeFullscreenOwnedRef.current) void exitFullscreen();
      }
      return;
    }

    if (!hasScreenShare) {
      setIsShareExpanded(false);
      setControlsVisible(false);
      if (isFullscreen && fullscreenPresentationRef.current === "share") {
        void exitFullscreen();
      }
    }
  }, [callStatus, hasScreenShare, isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void exitFullscreen();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isFullscreen]);

  useEffect(() => {
    if (isShareExpanded && !isRemoteWatchPending && isRemoteScreenAvailable && !isWatchingRemoteScreen && !isRemoteScreenLoading && !remoteScreenStream) {
      setIsShareExpanded(false);
    }
  }, [isRemoteScreenAvailable, isRemoteScreenLoading, isRemoteWatchPending, isShareExpanded, isWatchingRemoteScreen, remoteScreenStream]);

  const watchRemoteScreen = async () => {
    setIsShareExpanded(true);
    setIsRemoteWatchPending(true);
    try {
      await onWatchRemoteScreen();
    } finally {
      setIsRemoteWatchPending(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!stageRef.current) return;
    if (isFullscreenPending) return;

    if (isTauriDesktopRuntime()) {
      setIsFullscreenPending(true);
      const targetFullscreen = !isFullscreen;
      try {
        const currentWindow = getCurrentWindow();
        await currentWindow.setFullscreen(targetFullscreen);
        const fullscreen = await currentWindow.isFullscreen();
        nativeFullscreenOwnedRef.current = fullscreen;
        fullscreenPresentationRef.current = fullscreen ? (hasScreenShare ? "share" : "voice") : null;
        if (isMountedRef.current) setIsFullscreen(fullscreen);
      } catch (error) {
        try {
          const currentWindow = getCurrentWindow();
          try { await currentWindow.setFullscreen(false); } catch { /* best effort after partial entry */ }
          const fullscreen = await currentWindow.isFullscreen();
          nativeFullscreenOwnedRef.current = fullscreen;
          fullscreenPresentationRef.current = fullscreen ? (hasScreenShare ? "share" : "voice") : null;
          if (isMountedRef.current) setIsFullscreen(fullscreen);
        } catch (syncError) {
          console.warn("[ActiveCallDock] Failed to synchronize native fullscreen state", syncError);
        }
        console.warn("[ActiveCallDock] Failed to toggle native fullscreen", error);
      } finally {
        if (isMountedRef.current) setIsFullscreenPending(false);
      }
      return;
    }

    return;
  };

  const controlProps = {
    onMouseEnter: () => setControlsVisible(true),
    onMouseLeave: () => setControlsVisible(false),
  };

  const closeExpandedFromStage = () => {
    if (isFullscreen) void exitFullscreen();
    setIsShareExpanded(false);
  };

  const contextMenu = contextRequest && contextRequest.target.profileId !== "" && (
    <UserContextMenu
      {...contextRequest}
      onClose={closeUserContext}
      onProfile={() => { closeUserContext(); setProfileTarget(contextRequest.target); }}
      note={contextRequest.target.audioPreferenceKey ? userNotes[contextRequest.target.audioPreferenceKey] : undefined}
      volume={contextRequest.target.audioPreferenceKey ? callUserVolumes[contextRequest.target.audioPreferenceKey] ?? 100 : 100}
      muted={Boolean(contextRequest.target.audioPreferenceKey && mutedCallUserIds[contextRequest.target.audioPreferenceKey])}
      onVolumeChange={(volume) => { if (contextRequest.target.audioPreferenceKey) setCallUserVolume(contextRequest.target.audioPreferenceKey, volume); }}
      onMutedChange={(muted) => { if (contextRequest.target.audioPreferenceKey) setCallUserMuted(contextRequest.target.audioPreferenceKey, muted); }}
      onNote={() => { closeUserContext(); setNoteTarget(contextRequest.target); }}
      onCopyUsername={() => copyText(contextRequest.target.username, "Username copied", closeUserContext)}
      onCopyId={() => copyText(String(contextRequest.target.copyId), "User ID copied", closeUserContext)}
    />
  );
  const noteDialog = noteTarget && <UserNoteDialog initialNote={noteTarget.audioPreferenceKey ? userNotes[noteTarget.audioPreferenceKey] ?? "" : ""} onClose={() => setNoteTarget(null)} onSave={(note) => { if (noteTarget.audioPreferenceKey) setUserNotes(saveUserNote(noteTarget.audioPreferenceKey, note)); setNoteTarget(null); }} />;

  if (!hasScreenShare) {
    const voiceStage = (
      <section
        ref={(element) => { stageRef.current = element; }}
        className={cn(
          "active-call-dock active-call-dock--voice relative flex min-w-0 flex-col text-foreground",
          isFullscreen
            ? "fullscreen-call-surface h-full min-h-0 w-full flex-1 shrink border-0 overflow-hidden bg-black"
            : "h-[clamp(300px,42vh,480px)] min-h-[300px] shrink-0 border-b border-border",
        )}
        data-testid="active-call-dock"
        aria-label="Active call dock"
      >
        <div className="voice-call-status absolute left-4 top-3 z-10 min-w-0" data-testid="active-call-voice-status">
          <p className="truncate text-xs font-medium text-muted-foreground" data-testid="active-call-dock-status">
            {statusLabel} · {formatCallTime(seconds)}
          </p>
        </div>

        {displayIssue && (
          <div className="voice-call-issue absolute left-4 right-4 top-9 z-10 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-foreground" data-testid="call-issue-banner">
            {displayIssue.message}
          </div>
        )}

        {shouldShowDiagnostics && (
          <div className="voice-call-diagnostics pointer-events-none absolute right-4 top-3 z-10 hidden text-[11px] text-muted-foreground lg:block" data-testid="webrtc-diagnostics">
            connection {diagnostics.connectionState} · ice {diagnostics.iceConnectionState} · candidate {diagnostics.selectedLocalCandidateType}
          </div>
        )}

        <div className={cn("voice-call-participants flex min-h-0 flex-1 items-center justify-center px-4 pb-20 pt-10", isFullscreen && "fullscreen-voice-participants")} data-testid="active-call-voice-surface">
          <div className="voice-call-tile-row grid w-full max-w-[760px] grid-cols-2 gap-3" data-testid="voice-call-tile-row">
            <VoiceParticipantTile name="You" isMuted={isMuted} onContextMenu={(event) => openUserContext(event, selfTarget)} onKeyDown={(event) => { if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") openUserContext(event, selfTarget); }} />
            <VoiceParticipantTile name={remoteUsername} isLocallyMuted={remoteMutedLocally} onContextMenu={(event) => openUserContext(event, remoteTarget)} onKeyDown={(event) => { if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") openUserContext(event, remoteTarget); }} />
          </div>
        </div>

        <div className="voice-call-controls-wrap absolute inset-x-0 bottom-4 z-10 flex justify-center" data-testid="active-call-dock-controls">
          <CallControls
            className="voice-call-controls"
            isMuted={isMuted}
            isScreenSharing={false}
            isScreenShareUpdating={isScreenShareUpdating}
            isFullscreen={isFullscreen}
            onMuteToggle={onMuteToggle}
            onStartScreenShare={onStartScreenShare}
            onStopScreenShare={onStopScreenShare}
            onHangUp={onHangUp}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
      </section>
    );
    return <>{isFullscreen ? (fullscreenRoot ? createPortal(voiceStage, fullscreenRoot) : null) : voiceStage}{contextMenu}{profileTarget && <UserProfileDialog target={profileTarget} localNote={profileTarget.audioPreferenceKey ? userNotes[profileTarget.audioPreferenceKey] : undefined} onClose={() => setProfileTarget(null)} />}{noteDialog}</>;
  }

  if (!isShareExpanded) {
    const framedStage = (
      <section
        ref={(element) => { stageRef.current = element; }}
        className={cn(
          "active-call-dock active-call-dock--screen active-call-dock--framed flex min-w-0 flex-col text-foreground",
          isFullscreen
            ? "fullscreen-call-surface h-full min-h-0 w-full flex-1 shrink border-0 overflow-hidden bg-black"
            : "h-[clamp(300px,42vh,480px)] min-h-[300px] shrink-0 border-b border-border",
        )}
        data-testid="active-call-dock"
        aria-label="Active call dock"
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="absolute left-4 top-3 z-10 text-xs font-medium text-muted-foreground" data-testid="active-call-screen-status">
            {statusLabel} · {formatCallTime(seconds)}
          </div>

          {displayIssue && (
            <div className="absolute left-4 right-4 top-9 z-10 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-foreground" data-testid="call-issue-banner">
              {displayIssue.message}
            </div>
          )}

          <div className={cn(
            "screen-share-framed-layout flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 pb-20 pt-10",
            isFullscreen && "fullscreen-mosaic-layout",
          )}
          style={isFullscreen ? { paddingTop: "64px", paddingBottom: "64px" } : undefined}
          data-testid="screen-share-framed-layout"
        >
            <div
              className={cn(
                "screen-share-framed-row grid min-w-0 w-full max-w-[1120px] grid-cols-3 gap-4",
                isFullscreen && "fullscreen-mosaic-grid max-w-none",
              )}
              style={isFullscreen ? {
                width: "min(88vw, calc((100dvh - 128px - 72px - 8px) * 1.7777778 + 8px))",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gridTemplateRows: "repeat(2, minmax(0, 1fr))",
                gap: "8px",
              } : undefined}
              data-testid="screen-share-framed-row"
            >
              <ScreenShareFrame
                stream={isRemoteScreenAvailable ? (isWatchingRemoteScreen ? remoteScreenStream : null) : localScreenStream}
                sharerName={isRemoteScreenAvailable ? remoteUsername : "You"}
                isRemote={isRemoteScreenAvailable}
                isWatching={isWatchingRemoteScreen}
                isLoading={isRemoteScreenLoading || isRemoteWatchPending}
                onWatch={watchRemoteScreen}
                onExpand={() => setIsShareExpanded(true)}
                onContextMenu={(event) => openUserContext(event, isRemoteScreenAvailable ? remoteTarget : selfTarget)}
                onKeyDown={(event) => { if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") openUserContext(event, isRemoteScreenAvailable ? remoteTarget : selfTarget); }}
                isLocallyMuted={isRemoteScreenAvailable && remoteMutedLocally}
              />
              <FramedParticipantTile name="You" isMuted={isMuted} onContextMenu={(event) => openUserContext(event, selfTarget)} onKeyDown={(event) => { if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") openUserContext(event, selfTarget); }} />
              <FramedParticipantTile
                name={remoteUsername}
                className={isFullscreen ? "col-span-2 w-[calc(50%_-_4px)] justify-self-center" : undefined}
                onContextMenu={(event) => openUserContext(event, remoteTarget)}
                onKeyDown={(event) => { if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") openUserContext(event, remoteTarget); }}
                isLocallyMuted={remoteMutedLocally}
              />
            </div>
          </div>

          <div
            className={cn(
              "screen-share-framed-controls z-10 flex justify-center",
              isFullscreen ? "relative inset-auto shrink-0 pb-4" : "absolute inset-x-0 bottom-4",
            )}
            data-testid="active-call-dock-controls"
          >
            <CallControls
              className="screen-share-framed-controls__group"
              isMuted={isMuted}
              isScreenSharing={isScreenSharing}
              isScreenShareUpdating={isScreenShareUpdating}
              isFullscreen={isFullscreen}
              onMuteToggle={onMuteToggle}
              onStartScreenShare={onStartScreenShare}
              onStopScreenShare={onStopScreenShare}
              onHangUp={onHangUp}
              onToggleFullscreen={toggleFullscreen}
            />
          </div>
        </div>
      </section>
    );
    return <>{isFullscreen ? (fullscreenRoot ? createPortal(framedStage, fullscreenRoot) : null) : framedStage}{contextMenu}{profileTarget && <UserProfileDialog target={profileTarget} localNote={profileTarget.audioPreferenceKey ? userNotes[profileTarget.audioPreferenceKey] : undefined} onClose={() => setProfileTarget(null)} />}{noteDialog}</>;
  }

  const shareStage = (
    <section
      className={cn(
        "active-call-dock active-call-dock--screen flex min-w-0 flex-col text-foreground",
        isFullscreen
          ? "fullscreen-call-surface h-full min-h-0 w-full flex-1 shrink border-0 overflow-hidden bg-black"
          : "h-[clamp(300px,42vh,480px)] min-h-[300px] shrink-0 border-b border-border",
      )}
      data-testid="active-call-dock"
      aria-label="Active call dock"
    >
      {displayIssue && <div className="m-3 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm" data-testid="call-issue-banner">{displayIssue.message}</div>}
      <div
        ref={(element) => { stageRef.current = element; }}
        className={cn("screen-share-stage group relative min-h-0 flex-1 overflow-hidden bg-black", isFullscreen && "screen-share-stage--fullscreen fullscreen-share-layout flex flex-col")}
        data-testid="screen-share-stage"
        data-controls-visible={controlsVisible ? "true" : "false"}
        onMouseEnter={() => setControlsVisible(true)}
        onMouseLeave={() => setControlsVisible(false)}
        onFocus={() => setControlsVisible(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setControlsVisible(false); }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          if (isFullscreen) {
            setIsShareExpanded(false);
            return;
          }
          closeExpandedFromStage();
        }}
        onContextMenu={(event) => openUserContext(event, isRemoteScreenAvailable ? remoteTarget : selfTarget)}
        onKeyDown={(event) => { if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") openUserContext(event, isRemoteScreenAvailable ? remoteTarget : selfTarget); }}
        tabIndex={-1}
      >
        <div className={isFullscreen ? "fullscreen-share-video-area relative flex min-h-0 min-w-0 flex-1" : "absolute inset-0"} data-testid={isFullscreen ? "fullscreen-share-video-area" : undefined}>
          {remoteScreenStream && isWatchingRemoteScreen ? (
            <StreamVideo stream={remoteScreenStream} label={`${remoteUsername} screen share`} className="absolute inset-0 h-full w-full object-contain" muted testId="remote-screen-share-video" />
          ) : localScreenStream ? (
            <StreamVideo stream={localScreenStream} label="Your screen share" className="absolute inset-0 h-full w-full object-contain" muted testId="local-screen-share-video" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/75" data-testid="screen-share-loading">{isRemoteScreenLoading ? "Connecting to screen share…" : "Screen share is starting…"}</div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 text-white" data-testid="screen-share-info">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{remoteUsername}</p><p className="text-xs text-white/70">Screen sharing · {formatCallTime(seconds)}</p></div>
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-xs text-white/80">{statusLabel}</span>
        </div>

        {isFullscreen ? (
          <div className="fullscreen-share-participants relative z-10 mx-auto mb-4 mt-5 grid min-w-0 w-[min(560px,calc(100%-32px))] shrink-0 grid-cols-2 gap-3" data-testid="fullscreen-participant-strip">
            <FramedParticipantTile name="You" isMuted={isMuted} />
            <FramedParticipantTile name={remoteUsername} isLocallyMuted={remoteMutedLocally} />
          </div>
        ) : localScreenStream && remoteScreenStream ? (
          <div className="absolute bottom-20 right-4 h-[90px] w-[160px] overflow-hidden rounded-md bg-zinc-900 shadow-lg" data-testid="local-screen-share-pip"><StreamVideo stream={localScreenStream} label="Your screen share preview" className="h-full w-full object-cover" testId="local-screen-share-pip-video" /></div>
        ) : null}

        <div
          className={cn(
            "screen-share-stage__controls stage-controls flex justify-center",
            isFullscreen ? "relative inset-auto shrink-0 pb-4" : "absolute inset-x-0 bottom-4",
            !isFullscreen && "transition-[opacity,transform,visibility] duration-150 ease-out",
          )}
          style={isFullscreen ? { bottom: "auto" } : undefined}
          data-testid="active-call-dock-controls"
          {...controlProps}
        >
          <CallControls
            isMuted={isMuted}
            isScreenSharing={isScreenSharing}
            isScreenShareUpdating={isScreenShareUpdating}
            isFullscreen={isFullscreen}
            onMuteToggle={onMuteToggle}
            onStartScreenShare={onStartScreenShare}
            onStopScreenShare={onStopScreenShare}
            onHangUp={onHangUp}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
      </div>
    </section>
  );
  return <>{isFullscreen ? (fullscreenRoot ? createPortal(shareStage, fullscreenRoot) : null) : shareStage}{contextMenu}{profileTarget && <UserProfileDialog target={profileTarget} localNote={profileTarget.audioPreferenceKey ? userNotes[profileTarget.audioPreferenceKey] : undefined} onClose={() => setProfileTarget(null)} />}{noteDialog}</>;
}

function CallControls({
  className,
  isMuted, isScreenSharing, isScreenShareUpdating, isFullscreen, onMuteToggle, onStartScreenShare, onStopScreenShare, onHangUp, onToggleFullscreen, onMouseEnter, onMouseLeave,
}: {
  className?: string;
  isMuted: boolean; isScreenSharing: boolean; isScreenShareUpdating: boolean; isFullscreen: boolean; onMuteToggle: () => void; onStartScreenShare: () => Promise<void>; onStopScreenShare: () => void; onHangUp: () => void; onToggleFullscreen?: () => Promise<void>; onMouseEnter?: () => void; onMouseLeave?: () => void;
}) {
  return <div className={cn("call-controls flex items-center justify-center gap-2 rounded-lg bg-black/60 p-2 text-white", className)} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <button className={cn("vt-call-control h-10 w-10 p-0", isMuted && "bg-destructive/20 text-destructive")} onClick={onMuteToggle} aria-label={isMuted ? "Unmute" : "Mute"}>{isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
    <button className="vt-call-control h-10 w-10 p-0" onClick={isScreenSharing ? onStopScreenShare : () => { void onStartScreenShare(); }} aria-label={isScreenShareUpdating ? "Updating screen share" : isScreenSharing ? "Stop sharing" : "Share screen"} disabled={isScreenShareUpdating}>{isScreenSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}</button>
    {onToggleFullscreen && <button className="vt-call-control h-10 w-10 p-0" onClick={() => { void onToggleFullscreen(); }} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</button>}
    <button className="vt-call-control vt-call-control--danger h-10 w-10 p-0" onClick={onHangUp} aria-label="Hang Up"><PhoneOff className="h-4 w-4" /></button>
  </div>;
}

function ScreenShareFrame({
  stream,
  sharerName,
  isRemote,
  isWatching,
  isLoading,
  onWatch,
  onExpand,
  onContextMenu,
  onKeyDown,
  isLocallyMuted = false,
}: {
  stream: MediaStream | null;
  sharerName: string;
  isRemote: boolean;
  isWatching: boolean;
  isLoading: boolean;
  onWatch: () => Promise<void>;
  onExpand: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  isLocallyMuted?: boolean;
}) {
  const isWatchPlaceholder = isRemote && !isWatching;
  const content = stream ? (
    <StreamVideo stream={stream} label={`${sharerName} screen share`} className="absolute inset-0 h-full w-full object-contain" muted testId="screen-share-framed-video" />
  ) : isWatchPlaceholder ? (
    <div className="remote-screen-placeholder absolute inset-0 flex flex-col items-center justify-center gap-1 text-white">
      <MonitorUp className="h-6 w-6 text-white/80" aria-hidden="true" />
      <span className="remote-screen-placeholder__username font-medium">{sharerName}</span>
      <span className="remote-screen-placeholder__status text-xs text-white/65">Screen sharing</span>
      <span className="remote-screen-placeholder__action text-xs font-semibold text-white">Watch stream</span>
    </div>
  ) : (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-white/75" data-testid="screen-share-framed-loading">
      {isLoading ? "Connecting to screen share…" : "Screen share is starting…"}
    </div>
  );

  return (
    <button
      type="button"
      className="screen-share-framed-tile relative aspect-video min-w-0 overflow-hidden text-left"
      data-testid="screen-share-framed-tile"
      aria-label={isWatchPlaceholder ? `Watch ${sharerName}'s screen share` : `${sharerName} screen share`}
      aria-busy={isWatchPlaceholder && isLoading}
      disabled={isWatchPlaceholder && isLoading}
      onClick={() => { if (isWatchPlaceholder) void onWatch(); else onExpand(); }}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      {content}
      <span className="screen-share-framed-label absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] items-center gap-1 truncate px-2 py-1 text-xs text-white">{sharerName} · Screen share{isLocallyMuted && <VolumeX className="h-3.5 w-3.5 shrink-0" aria-label="Muted locally" />}</span>
    </button>
  );
}

function FramedParticipantTile({ name, isMuted = false, isLocallyMuted = false, className, onContextMenu, onKeyDown }: { name: string; isMuted?: boolean; isLocallyMuted?: boolean; className?: string; onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void; onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void }) {
  return (
    <div tabIndex={0} onContextMenu={onContextMenu} onKeyDown={onKeyDown} className={cn("screen-share-framed-tile relative flex aspect-video min-w-0 items-center justify-center overflow-hidden", className)} data-testid="screen-share-framed-participant-tile">
      <div className="voice-participant-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="absolute bottom-2 left-2 flex min-w-0 max-w-[calc(100%-16px)] items-center gap-1.5 text-xs font-medium" data-testid="screen-share-framed-participant-label">
        <span className="truncate">{name}</span>
        {isMuted && <MicOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label={`${name} muted`} />}
        {isLocallyMuted && <VolumeX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Muted locally" />}
      </div>
    </div>
  );
}

function VoiceParticipantTile({ name, isMuted = false, isLocallyMuted = false, onContextMenu, onKeyDown }: { name: string; isMuted?: boolean; isLocallyMuted?: boolean; onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void; onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void }) {
  return (
    <div tabIndex={0} onContextMenu={onContextMenu} onKeyDown={onKeyDown} className="voice-participant-tile relative flex aspect-video min-w-0 items-center justify-center overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" data-testid="active-call-voice-participant-tile">
      <div className="voice-participant-avatar flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-semibold" aria-hidden="true" data-testid="voice-participant-avatar">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="absolute bottom-3 left-3 flex min-w-0 max-w-[calc(100%-24px)] items-center gap-1.5 text-sm font-medium" data-testid="voice-participant-label">
        <span className="truncate">{name}</span>
        {isMuted && <MicOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label={`${name} muted`} />}
        {isLocallyMuted && <VolumeX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Muted locally" />}
      </div>
    </div>
  );
}
