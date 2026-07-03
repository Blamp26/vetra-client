import { ParticipantTile, type ScreenShareTileState } from "./ParticipantTile";

export interface CallGridParticipant {
  id: string;
  name: string;
  label: string;
  isMuted?: boolean;
}

export interface CallGridScreenShare {
  id: string;
  sharerName: string;
  stream: MediaStream | null;
  state: ScreenShareTileState;
  isLocalSharer: boolean;
}

interface CallGridViewProps {
  participants: CallGridParticipant[];
  screenShares: CallGridScreenShare[];
  compactParticipants: boolean;
  isScreenShareUpdating: boolean;
  onWatchStream: (id: string) => void;
  onExpandStream: (id: string) => void;
  onStopScreenShare: () => void;
}

export function CallGridView({
  participants,
  screenShares,
  compactParticipants,
  isScreenShareUpdating,
  onWatchStream,
  onExpandStream,
  onStopScreenShare,
}: CallGridViewProps) {
  const tileCount = participants.length + screenShares.length;
  const hasPrimaryScreenShare = screenShares.some((share) => share.state === "watchingInline");
  const participantTileSizeClass = hasPrimaryScreenShare
    ? "h-[clamp(96px,18vh,180px)] min-w-[180px] flex-[1_1_180px] max-w-[260px]"
    : getTileSizeClass(tileCount);
  const screenShareTileSizeClass = hasPrimaryScreenShare
    ? "h-[clamp(220px,34vh,360px)] w-full max-w-[920px] flex-[1_1_100%]"
    : getTileSizeClass(tileCount);

  return (
    <div
      className="call-grid flex h-full w-full flex-wrap content-center items-center justify-center gap-[clamp(20px,3vw,50px)]"
      data-testid="call-grid-view"
      data-tile-count={tileCount}
      data-layout={hasPrimaryScreenShare ? "screen-share-stage" : "tiles"}
    >
      {screenShares.map((share) => (
        <ParticipantTile
          key={share.id}
          name={share.sharerName}
          label="Screen share"
          variant="screenShare"
          stream={share.stream}
          screenShareState={share.state}
          isLocalSharer={share.isLocalSharer}
          onWatch={() => onWatchStream(share.id)}
          onExpand={() => onExpandStream(share.id)}
          onStopScreenShare={share.isLocalSharer ? onStopScreenShare : undefined}
          isScreenShareUpdating={isScreenShareUpdating}
          className={screenShareTileSizeClass}
          data-testid="active-call-screen-share-tile"
        />
      ))}

      {participants.map((participant) => (
        <ParticipantTile
          key={participant.id}
          name={participant.name}
          label={participant.label}
          variant="avatar"
          isMuted={participant.isMuted}
          compact={compactParticipants || hasPrimaryScreenShare}
          className={participantTileSizeClass}
          data-testid="active-call-participant-tile"
        />
      ))}
    </div>
  );
}

function getTileSizeClass(tileCount: number): string {
  if (tileCount <= 2) {
    return "h-[clamp(220px,37vh,396px)] min-w-[320px] flex-[1_1_320px] max-w-[705px]";
  }
  if (tileCount <= 4) {
    return "h-[clamp(180px,30vh,320px)] min-w-[260px] flex-[1_1_260px] max-w-[520px]";
  }
  return "h-[clamp(140px,24vh,260px)] min-w-[220px] flex-[1_1_220px] max-w-[380px]";
}
