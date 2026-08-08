import type { ResourceRef } from "@/shared/types";
import type { GroupCallParticipant } from "@/shared/types";
import type { GroupCallSignal, SocketManager } from "@/services/socket";
import {
  DirectedCallWebRtcAdapter,
  type DirectedCallMediaStream,
} from "./directedCallWebRtcAdapter";

export type GroupCallPeerSnapshot = {
  userId: number;
  state: "connecting" | "connected" | "failed";
  audio: DirectedCallMediaStream | null;
  camera: DirectedCallMediaStream | null;
  screen: DirectedCallMediaStream | null;
};

export type GroupCallRuntimeSnapshot = {
  status: "idle" | "connecting" | "connected" | "reconnecting" | "failed";
  peers: GroupCallPeerSnapshot[];
  localAudio: DirectedCallMediaStream | null;
  localCamera: DirectedCallMediaStream | null;
  localScreen: DirectedCallMediaStream | null;
};

type Peer = {
  userId: number;
  adapter: DirectedCallWebRtcAdapter;
  state: GroupCallPeerSnapshot["state"];
  initiator: boolean;
};

function refToNumber(ref: ResourceRef): number {
  const value = Number(ref);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid group call room");
  return value;
}

function signalPayload(signal: GroupCallSignal): Record<string, unknown> {
  return signal.payload;
}

/**
 * Mesh runtime for an ordinary group call. It deliberately owns no call
 * authority: REST projection and group-call events remain authoritative while
 * this class only owns peer adapters and transient signal routing.
 */
export class GroupCallRuntime {
  private readonly socketManager: SocketManager;
  private readonly roomId: number;
  private readonly currentUserId: number;
  private callId: string;
  private readonly peers = new Map<number, Peer>();
  private readonly listeners = new Set<(snapshot: GroupCallRuntimeSnapshot) => void>();
  private unsubscribeSignal: (() => void) | null = null;
  private status: GroupCallRuntimeSnapshot["status"] = "idle";
  private disposed = false;
  private localAudio: DirectedCallMediaStream | null = null;
  private localCamera: DirectedCallMediaStream | null = null;
  private localScreen: DirectedCallMediaStream | null = null;

  constructor(options: { socketManager: SocketManager; roomRef: ResourceRef; currentUserId: number; callId: string }) {
    this.socketManager = options.socketManager;
    this.roomId = refToNumber(options.roomRef);
    this.currentUserId = options.currentUserId;
    this.callId = options.callId;
    const subscribeToSignal = options.socketManager.onGroupCallSignal;
    this.unsubscribeSignal = typeof subscribeToSignal === "function"
      ? subscribeToSignal((signal) => { void this.handleSignal(signal); })
      : null;
  }

  subscribe(listener: (snapshot: GroupCallRuntimeSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): GroupCallRuntimeSnapshot {
    return {
      status: this.status,
      peers: [...this.peers.values()].map(({ userId, adapter, state }) => ({
        userId,
        state,
        audio: adapter.remoteMediaStream,
        camera: adapter.getRemoteCameraStream(),
        screen: adapter.getRemoteScreenShareStream(),
      })),
      localAudio: this.localAudio,
      localCamera: this.localCamera,
      localScreen: this.localScreen,
    };
  }

  async reconcile(callId: string, participants: GroupCallParticipant[]): Promise<void> {
    if (this.disposed) return;
    this.callId = callId;
    const active = new Set(participants.filter((participant) => participant.user_id !== this.currentUserId).map((participant) => participant.user_id));
    for (const userId of this.peers.keys()) {
      if (!active.has(userId)) this.removePeer(userId);
    }
    this.status = active.size > 0 ? "connecting" : "connected";
    this.emit();
    await Promise.all([...active].map((userId) => this.ensurePeer(userId, this.currentUserId < userId)));
    await Promise.all([...this.peers.values()]
      .filter((peer) => peer.state === "failed")
      .map((peer) => this.recoverPeer(peer)));
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await Promise.all([...this.peers.values()].map(({ adapter }) => {
      adapter.setLocalAudioMuted(!enabled);
      return Promise.resolve();
    }));
    this.emit();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    await Promise.all([...this.peers.values()].map(async ({ adapter }) => {
      if (await adapter.setCameraEnabled(enabled)) {
        if (enabled) this.localCamera = adapter.getLocalCameraStream();
        else this.localCamera = null;
        await this.renegotiate(adapter);
      }
    }));
    this.emit();
  }

  async setScreenSharingEnabled(enabled: boolean): Promise<void> {
    await Promise.all([...this.peers.values()].map(async ({ adapter }) => {
      if (enabled) {
        if (await adapter.startScreenShare()) this.localScreen = adapter.getLocalScreenShareStream();
      } else {
        adapter.stopScreenShare();
        this.localScreen = null;
      }
      await this.renegotiate(adapter);
    }));
    this.emit();
  }

  async switchAudioInput(constraints: MediaStreamConstraints): Promise<void> {
    await Promise.all([...this.peers.values()].map(({ adapter }) => adapter.switchAudioInput(constraints)));
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeSignal?.();
    this.unsubscribeSignal = null;
    for (const userId of this.peers.keys()) this.removePeer(userId);
    this.localAudio = null;
    this.localCamera = null;
    this.localScreen = null;
    this.listeners.clear();
  }

  private async ensurePeer(userId: number, initiator: boolean): Promise<void> {
    if (this.disposed || this.peers.has(userId)) return;
    const adapter = new DirectedCallWebRtcAdapter({
      onIceCandidate: (candidate) => this.sendSignal(userId, "ice_candidate", { candidate }),
      onRemoteStream: (stream) => { this.localAudio = this.localAudio ?? adapter.localMediaStream; this.emit(); void stream; },
      onRemoteCameraStream: () => this.emit(),
      onRemoteScreenShareChanged: () => this.emit(),
      onPeerConnectionState: (state) => {
        const peer = this.peers.get(userId);
        if (!peer) return;
        peer.state = state === "connected" || state === "completed" ? "connected" : state === "failed" ? "failed" : "connecting";
        this.status = peer.state === "failed" ? "failed" : "connected";
        this.emit();
      },
    });
    const peer: Peer = { userId, adapter, state: "connecting", initiator };
    this.peers.set(userId, peer);
    try {
      if (initiator) {
        const offer = await adapter.prepareOffer();
        await this.sendSignal(userId, "offer", { type: offer.type, sdp: offer.sdp ?? "" });
      } else {
        await adapter.prepareAnswer();
      }
      this.localAudio = adapter.localMediaStream;
      this.status = "connected";
      this.emit();
    } catch {
      peer.state = "failed";
      this.status = "failed";
      this.emit();
    }
  }

  private async recoverPeer(peer: Peer): Promise<void> {
    if (this.disposed) return;
    peer.state = "connecting";
    this.status = "reconnecting";
    this.emit();
    try {
      await peer.adapter.rebuildPeerConnection();
      if (peer.initiator) {
        const offer = await peer.adapter.createPeerConnectionRebuildOffer();
        await this.sendSignal(peer.userId, "renegotiate_offer", { type: offer.type, sdp: offer.sdp ?? "" });
      }
      peer.state = "connected";
      this.status = "connected";
    } catch {
      peer.state = "failed";
      this.status = "failed";
    }
    this.emit();
  }

  private async handleSignal(signal: GroupCallSignal): Promise<void> {
    if (this.disposed || signal.room_id !== this.roomId || signal.call_id !== this.callId || signal.to_user_id !== this.currentUserId) return;
    const peerId = signal.from_user_id;
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const payload = signalPayload(signal);
    try {
      switch (signal.kind) {
        case "offer": {
          const answer = await peer.adapter.acceptOffer({ type: "offer", sdp: String(payload.sdp ?? "") });
          if (answer) await this.sendSignal(peerId, "answer", { type: answer.type, sdp: answer.sdp ?? "" });
          break;
        }
        case "answer":
          await peer.adapter.acceptAnswer({ type: "answer", sdp: String(payload.sdp ?? "") });
          break;
        case "ice_candidate":
          await peer.adapter.addRemoteIceCandidate(payload.candidate as RTCIceCandidateInit);
          break;
        case "renegotiate_offer":
          await peer.adapter.applyRenegotiationOffer({ type: "offer", sdp: String(payload.sdp ?? "") });
          await this.sendSignal(peerId, "renegotiate_answer", { type: "answer", sdp: (await peer.adapter.createRenegotiationAnswer()).sdp ?? "" });
          break;
        case "renegotiate_answer":
          await peer.adapter.applyRenegotiationAnswer({ type: "answer", sdp: String(payload.sdp ?? "") });
          break;
      }
      peer.state = "connected";
      this.status = "connected";
      this.emit();
    } catch {
      peer.state = "failed";
      this.status = "failed";
      this.emit();
    }
  }

  private async renegotiate(adapter: DirectedCallWebRtcAdapter): Promise<void> {
    if (this.disposed || !adapter.hasRemoteDescription) return;
    const peer = [...this.peers.values()].find((candidate) => candidate.adapter === adapter);
    if (!peer) return;
    const offer = await adapter.createRenegotiationOffer();
    await this.sendSignal(peer.userId, "renegotiate_offer", { type: offer.type, sdp: offer.sdp ?? "" });
  }

  private sendSignal(toUserId: number, kind: GroupCallSignal["kind"], payload: Record<string, unknown>): Promise<void> {
    return this.socketManager.sendGroupCallSignal(this.roomId, {
      call_id: this.callId,
      to_user_id: toUserId,
      kind,
      payload,
      signal_id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    });
  }

  private removePeer(userId: number): void {
    const peer = this.peers.get(userId);
    if (!peer) return;
    peer.adapter.dispose();
    this.peers.delete(userId);
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
