import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, MonitorUp, Phone, PhoneOff, Settings2 } from "lucide-react";
import { roomsApi } from "@/api/rooms";
import type { GroupCallCapabilities, GroupCallEvent, GroupCallProjection, ResourceRef } from "@/shared/types";
import type { SocketManager } from "@/services/socket";
import { Button } from "@/shared/components/Button";
import { GroupCallRuntime, type GroupCallRuntimeSnapshot } from "../../services/groupCallRuntime";

interface Props {
  roomRef: ResourceRef;
  currentUserId: number;
  socketManager: SocketManager | null;
}

export function GroupCallPanel({ roomRef, currentUserId, socketManager }: Props) {
  const [call, setCall] = useState<GroupCallProjection | null>(null);
  const [capabilities, setCapabilities] = useState<GroupCallCapabilities>({ can_start: false, can_join: false, can_end_for_everyone: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState({ microphone_enabled: false, camera_enabled: false, screen_sharing: false });
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<GroupCallRuntimeSnapshot | null>(null);
  const runtimeRef = useRef<GroupCallRuntime | null>(null);

  const reconcile = useCallback(async () => {
    try {
      const value = await roomsApi.getGroupCall(roomRef);
      const projection = "call" in value ? value.call : value;
      setCall(projection ?? null);
      if ("capabilities" in value) setCapabilities(value.capabilities);
      const viewer = projection?.participants.find((participant) => participant.user_id === currentUserId);
      setMedia(viewer ? {
        microphone_enabled: viewer.microphone_enabled,
        camera_enabled: viewer.camera_enabled,
        screen_sharing: viewer.screen_sharing,
      } : { microphone_enabled: false, camera_enabled: false, screen_sharing: false });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load group call");
    }
  }, [roomRef]);

  useEffect(() => { void reconcile(); }, [reconcile]);
  useEffect(() => {
    if (!socketManager || typeof socketManager.onGroupCallEvent !== "function") return;
    const onEvent = (event: GroupCallEvent) => { if (event.room_id === Number(roomRef)) void reconcile(); };
    const unsub = socketManager.onGroupCallEvent(onEvent);
    const unsubRemoved = typeof socketManager.onRoomMemberRemoved === "function"
      ? socketManager.onRoomMemberRemoved((event) => { if (event.room_id === Number(roomRef) && event.user_id === currentUserId) setCall(null); })
      : () => undefined;
    const unsubDeleted = typeof socketManager.onRoomDeleted === "function"
      ? socketManager.onRoomDeleted((event) => { if (event.room_id === Number(roomRef)) setCall(null); })
      : () => undefined;
    return () => { unsub(); unsubRemoved(); unsubDeleted(); };
  }, [currentUserId, reconcile, roomRef, socketManager]);

  useEffect(() => {
    if (!socketManager || !call?.viewer_joined) {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      setRuntimeSnapshot(null);
      return;
    }
    const runtime = new GroupCallRuntime({ socketManager, roomRef, currentUserId, callId: call.call_id });
    runtimeRef.current = runtime;
    const unsubscribe = runtime.subscribe(setRuntimeSnapshot);
    void runtime.reconcile(call.call_id, call.participants);
    return () => {
      unsubscribe();
      runtime.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [call?.call_id, call?.viewer_joined, currentUserId, roomRef, socketManager]);

  useEffect(() => {
    if (!call?.viewer_joined || !runtimeRef.current) return;
    void runtimeRef.current.reconcile(call.call_id, call.participants);
  }, [call?.call_id, call?.participants, call?.state_version, call?.viewer_joined]);

  const mutate = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); await reconcile(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Group call action failed"); }
    finally { setBusy(false); }
  };

  const joined = Boolean(call?.viewer_joined);
  const participantCount = call?.participants.length ?? 0;
  const toggleMedia = (key: keyof typeof media) => {
    if (!call) return;
    const next = !media[key];
    setMedia((value) => ({ ...value, [key]: next }));
    if (key === "microphone_enabled") void runtimeRef.current?.setMicrophoneEnabled(next);
    if (key === "camera_enabled") void runtimeRef.current?.setCameraEnabled(next);
    void mutate(() => roomsApi.updateGroupCallMedia(roomRef, call.call_id, { [key]: next }));
  };

  const startScreenShare = async () => {
    toggleMedia("screen_sharing");
  };

  const status = useMemo(() => call ? `${participantCount} participant${participantCount === 1 ? "" : "s"}` : "No active call", [call, participantCount]);

  return (
    <section aria-label="Group call" className="border-b border-border bg-card/80 px-4 py-3" data-testid="group-call-panel">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{call ? "Group call" : "Group call available"}</p><p className="text-xs text-muted-foreground" aria-live="polite">{call ? (joined ? `Connected · ${status}` : `Active · ${status}`) : status}</p></div>
        {!call && capabilities.can_start && <Button size="compact" disabled={busy} onClick={() => void mutate(() => roomsApi.startGroupCall(roomRef))}><Phone className="mr-1 h-4 w-4" />Start call</Button>}
        {call && !joined && capabilities.can_join && <Button size="compact" disabled={busy} onClick={() => void mutate(() => roomsApi.joinGroupCall(roomRef))}><Phone className="mr-1 h-4 w-4" />Join call</Button>}
        {call && joined && <Button variant="ghost" size="compact" disabled={busy} onClick={() => void mutate(() => roomsApi.leaveGroupCall(roomRef, call.call_id))}><PhoneOff className="mr-1 h-4 w-4" />Leave</Button>}
        {call?.can_end_for_everyone && <Button variant="danger" size="compact" disabled={busy} onClick={() => void mutate(() => roomsApi.endGroupCall(roomRef, call.call_id))}><PhoneOff className="mr-1 h-4 w-4" />End for everyone</Button>}
      </div>
      {call && joined && <>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Call participants">
          {call.participants.map((participant) => {
            const peer = runtimeSnapshot?.peers.find((candidate) => candidate.userId === participant.user_id);
            return <div key={participant.user_id} className="rounded-md border border-border px-3 py-2 text-xs">
              {peer?.camera && <video autoPlay playsInline muted ref={(element) => { if (element) element.srcObject = peer.camera as unknown as MediaStream; }} className="mb-2 aspect-video w-full rounded object-cover" />}
              <span className="block truncate font-medium">{participant.display_name || participant.username || `User #${participant.user_id}`}</span>
              <span className="text-muted-foreground">{participant.microphone_enabled ? "Mic on" : "Mic off"}{participant.camera_enabled ? " · Camera on" : ""}{participant.screen_sharing ? " · Sharing" : ""}{peer ? ` · ${peer.state}` : ""}</span>
            </div>;
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Group call controls">
          <Button variant="ghost" size="compact" disabled={busy} onClick={() => toggleMedia("microphone_enabled")}><>{media.microphone_enabled ? <Mic className="mr-1 h-4 w-4" /> : <MicOff className="mr-1 h-4 w-4" />}{media.microphone_enabled ? "Mute" : "Unmute"}</></Button>
          <Button variant="ghost" size="compact" disabled={busy} onClick={() => toggleMedia("camera_enabled")}><>{media.camera_enabled ? <Camera className="mr-1 h-4 w-4" /> : <CameraOff className="mr-1 h-4 w-4" />}{media.camera_enabled ? "Camera off" : "Camera on"}</></Button>
          <Button variant="ghost" size="compact" disabled={busy} onClick={() => void startScreenShare()}><MonitorUp className="mr-1 h-4 w-4" />{media.screen_sharing ? "Stop sharing" : "Share screen"}</Button>
          <Button variant="ghost" size="compact" onClick={() => void reconcile()}><Settings2 className="mr-1 h-4 w-4" />Refresh state</Button>
        </div>
      </>}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
