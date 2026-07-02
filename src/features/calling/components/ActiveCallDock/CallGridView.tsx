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
  const gridCols =
    tileCount <= 1
      ? "grid-cols-1"
      : tileCount === 2
        ? "grid-cols-2"
        : "grid-cols-2 lg:grid-cols-3";

  return (
    <div
      className={`grid h-full w-full max-w-4xl auto-rows-fr gap-3 ${gridCols}`}
      data-testid="call-grid-view"
    >
      {participants.map((participant) => (
        <ParticipantTile
          key={participant.id}
          name={participant.name}
          label={participant.label}
          variant="avatar"
          isMuted={participant.isMuted}
          compact={compactParticipants}
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
          data-testid="active-call-screen-share-tile"
        />
      ))}
    </div>
  );
}
