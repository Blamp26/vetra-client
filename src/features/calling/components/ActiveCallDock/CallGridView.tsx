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
  const tileSizeClass = "h-[clamp(140px,14vw,190px)] max-h-[190px] w-[clamp(220px,24vw,330px)] max-w-[330px] shrink-0";

  return (
    <div
      className="call-grid flex h-full w-full flex-wrap content-center items-center justify-center gap-[clamp(24px,2vw,32px)]"
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
          className={tileSizeClass}
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
          className={tileSizeClass}
          data-testid="active-call-participant-tile"
        />
      ))}
    </div>
  );
}
