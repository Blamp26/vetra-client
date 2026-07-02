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
  const tileSizeClass = getTileSizeClass(tileCount);

  return (
    <div
      className="flex w-full max-w-[720px] flex-wrap items-center justify-center gap-2"
      data-testid="call-grid-view"
      data-tile-count={tileCount}
    >
      {participants.map((participant) => (
        <ParticipantTile
          key={participant.id}
          name={participant.name}
          label={participant.label}
          variant="avatar"
          isMuted={participant.isMuted}
          compact={compactParticipants}
          className={tileSizeClass}
          data-testid="active-call-participant-tile"
        />
      ))}

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
    </div>
  );
}

function getTileSizeClass(tileCount: number): string {
  if (tileCount <= 2) {
    return "h-[150px] w-[min(220px,calc((100vw-6rem)/2))]";
  }
  if (tileCount <= 4) {
    return "h-[120px] w-[min(170px,calc((100vw-6rem)/2))]";
  }
  return "h-[95px] w-[min(130px,calc((100vw-5rem)/2))]";
}
