import type { User } from "@/shared/types";
import { ActiveCallDock } from "../ActiveCallDock";
import { usePersistentCall } from "../../context/PersistentCallContext";
import { persistentActiveCallDockModel, usePersistentCallElapsedSeconds } from "./PersistentCallViewModel";

export function PersistentActiveCallDock({ currentUser, remoteUser }: { currentUser: User; remoteUser: User | null }) {
  const call = usePersistentCall();
  const seconds = usePersistentCallElapsedSeconds(call.presentation);
  const model = persistentActiveCallDockModel(call, currentUser, remoteUser, seconds);
  return (
    <ActiveCallDock
      currentUser={model.currentUser}
      remoteUserId={model.remoteUserId}
      remoteUser={model.remoteUser}
      remoteUsername={model.remoteUsername}
      callStatus="active"
      seconds={model.seconds}
      isMuted={model.isMuted}
      isScreenSharing={false}
      isScreenShareUpdating={false}
      isRemoteScreenLoading={false}
      isRemoteScreenAvailable={false}
      isWatchingRemoteScreen={false}
      callIssue={model.callIssue}
      remoteScreenStream={null}
      localScreenStream={null}
      diagnostics={model.diagnostics}
      screenShareAvailable={false}
      onMuteToggle={call.toggleMute}
      onStartScreenShare={async () => undefined}
      onStopScreenShare={() => undefined}
      onWatchRemoteScreen={async () => undefined}
      onHangUp={() => { void call.hangup(); }}
    />
  );
}
