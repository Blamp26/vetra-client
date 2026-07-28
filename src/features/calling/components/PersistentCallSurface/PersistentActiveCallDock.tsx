import type { User } from "@/shared/types";
import { ActiveCallDock } from "../ActiveCallDock";
import { usePersistentCall } from "../../context/PersistentCallContext";
import { persistentActiveCallDockModel, usePersistentCallElapsedSeconds } from "./PersistentCallViewModel";

export function PersistentActiveCallDock({ currentUser, remoteUser }: { currentUser: User; remoteUser: User | null }) {
  const call = usePersistentCall();
  const seconds = usePersistentCallElapsedSeconds(call.presentation);
  const model = persistentActiveCallDockModel(call, currentUser, remoteUser, seconds);
  const hasRemoteScreenStream = Boolean(model.remoteScreenShareStream);
  const localScreenStream = model.localScreenShareStream as unknown as MediaStream | null;
  const remoteScreenStream = model.remoteScreenShareStream as unknown as MediaStream | null;
  return (
    <ActiveCallDock
      currentUser={model.currentUser}
      remoteUserId={model.remoteUserId}
      remoteUser={model.remoteUser}
      remoteUsername={model.remoteUsername}
      callStatus="active"
      seconds={model.seconds}
      isMuted={model.isMuted}
      muted={model.muted}
      deafened={model.deafened}
      effectiveMuted={model.effectiveMuted}
      canToggleMute={model.canToggleMute}
      canToggleDeafen={model.canToggleDeafen}
      isScreenSharing={model.isScreenSharing}
      isScreenShareUpdating={false}
      isRemoteScreenLoading={false}
      isRemoteScreenAvailable={model.remoteScreenShareAvailable || hasRemoteScreenStream}
      isWatchingRemoteScreen={hasRemoteScreenStream}
      callIssue={model.callIssue}
      remoteScreenStream={remoteScreenStream}
      localScreenStream={localScreenStream}
      diagnostics={model.diagnostics}
      screenShareAvailable={model.screenShareAvailable}
      onMuteToggle={call.toggleMute}
      onDeafenToggle={call.toggleDeafen}
      onStartScreenShare={async () => { await model.startScreenShare(); }}
      onStopScreenShare={() => { void model.stopScreenShare(); }}
      onWatchRemoteScreen={async () => undefined}
      onHangUp={() => { void call.hangup(); }}
    />
  );
}
