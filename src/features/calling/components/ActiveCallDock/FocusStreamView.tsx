import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { detachVideo, safelyPlayVideo } from "./mediaVideo";
import type { CallGridParticipant } from "./CallGridView";

interface FocusStreamViewProps {
  stream: MediaStream;
  sharerName: string;
  isLocalSharer: boolean;
  participants: CallGridParticipant[];
  isMuted: boolean;
  isScreenSharing: boolean;
  isScreenShareUpdating: boolean;
  onExitFocus: () => void;
  onMuteToggle: () => void;
  onStartScreenShare: () => Promise<void>;
  onStopScreenShare: () => void;
  onHangUp: () => void;
}

export function FocusStreamView({
  stream,
  sharerName,
  isLocalSharer,
  participants,
  isMuted,
  isScreenSharing,
  isScreenShareUpdating,
  onExitFocus,
  onMuteToggle,
  onStartScreenShare,
  onStopScreenShare,
  onHangUp,
}: FocusStreamViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    setIsVideoReady(false);
    if (!video) return;

    video.srcObject = stream;
    void safelyPlayVideo(video, "focused_screen_share");

    return () => {
      detachVideo(video);
    };
  }, [stream]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-white" data-testid="focus-stream-view">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="h-4 w-4 shrink-0 text-zinc-300" />
          <h2 className="truncate text-sm text-zinc-100">{sharerName}'s screen</h2>
          <span className="rounded-sm bg-red-600 px-2 py-1 text-[10px] uppercase text-white">LIVE</span>
          <span className="text-xs uppercase text-zinc-400">720p</span>
        </div>
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          onClick={onExitFocus}
          aria-label="Exit focus view"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 bg-black p-3" data-testid="focus-stream-stage">
        <div className="relative h-full overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalSharer}
            onLoadedData={() => setIsVideoReady(true)}
            onCanPlay={() => setIsVideoReady(true)}
            className="h-full w-full bg-black object-contain"
            data-testid="focus-stream-video"
          />
          {!isVideoReady && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400"
              data-testid="focus-stream-loading"
            >
              Loading shared screen...
            </div>
          )}
        </div>
      </div>

      <div
        className="flex shrink-0 gap-2 overflow-x-auto border-t border-zinc-800 bg-zinc-900 px-4 py-2"
        data-testid="focus-participant-strip"
      >
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="flex min-w-36 items-center gap-2 rounded-md bg-zinc-800 px-3 py-2"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-sm text-zinc-100">
              {participant.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-100">{participant.name}</p>
              <p className="truncate text-[10px] uppercase text-zinc-500">
                {participant.isMuted ? "Muted" : participant.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-zinc-800 bg-zinc-900 px-4 py-2"
        data-testid="focus-control-bar"
      >
        <div />
        <div className="flex items-center justify-center gap-2">
          <button
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 transition-colors",
              isMuted ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <button
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm text-zinc-100 transition-colors disabled:pointer-events-none disabled:opacity-60",
              isScreenSharing ? "bg-zinc-700" : "bg-zinc-800 hover:bg-zinc-700",
            )}
            onClick={isScreenSharing ? onStopScreenShare : () => { void onStartScreenShare(); }}
            aria-label={
              isScreenShareUpdating
                ? "Updating screen share"
                : isScreenSharing
                  ? "Stop sharing"
                  : "Share screen"
            }
            disabled={isScreenShareUpdating}
          >
            {isScreenSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
            <span>{isScreenShareUpdating ? "Updating..." : isScreenSharing ? "Stop sharing" : "Share screen"}</span>
          </button>

          <button
            className="flex h-10 w-10 items-center justify-center rounded-md border border-red-700 bg-red-600 text-white hover:bg-red-700"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            aria-label="Stream volume"
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            aria-label="Pop out stream"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            aria-label="Fullscreen stream"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
