import { createDirectedCallUuid } from "./directedCallDevice";

export type DirectedCallWebRtcFailureCode =
  | "permission_denied"
  | "microphone_unavailable"
  | "peer_connection_failed"
  | "sdp_failed"
  | "ice_failed"
  | "media_binding_failed";

export class DirectedCallWebRtcError extends Error {
  readonly failureCode: DirectedCallWebRtcFailureCode;

  constructor(failureCode: DirectedCallWebRtcFailureCode) {
    super(failureCode);
    this.name = "DirectedCallWebRtcError";
    this.failureCode = failureCode;
  }
}

export class DirectedCallWebRtcStaleError extends Error {
  constructor() {
    super("stale directed-call media attempt");
    this.name = "DirectedCallWebRtcStaleError";
  }
}

export interface DirectedCallMediaStreamTrack {
  stop(): void;
  kind?: string;
  enabled?: boolean;
  readyState?: string;
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
}

export interface DirectedCallMediaStream {
  getTracks(): DirectedCallMediaStreamTrack[];
  addTrack?(track: DirectedCallMediaStreamTrack): void;
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
}

interface PeerConnectionLike {
  connectionState?: RTCPeerConnectionState;
  onconnectionstatechange: ((event: Event) => void) | null;
  localDescription: RTCSessionDescription | null;
  remoteDescription: RTCSessionDescription | null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
  ontrack: ((event: RTCTrackEvent) => void) | null;
  addTrack(track: DirectedCallMediaStreamTrack, stream: DirectedCallMediaStream): unknown;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(): void;
}

export interface DirectedCallWebRtcAdapterDependencies {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<DirectedCallMediaStream>;
  createPeerConnection: () => PeerConnectionLike;
  createRemoteStream?: () => DirectedCallMediaStream;
  createSignalId?: () => string;
}

export interface DirectedCallWebRtcAdapterOptions {
  dependencies?: DirectedCallWebRtcAdapterDependencies;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void | Promise<void>;
  onRemoteStream?: (stream: DirectedCallMediaStream) => void;
  onPeerConnectionState?: (state: RTCPeerConnectionState) => void;
}

function defaultDependencies(): DirectedCallWebRtcAdapterDependencies {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createPeerConnection: () => new RTCPeerConnection(),
    createRemoteStream: () => new MediaStream(),
    createSignalId: createDirectedCallUuid,
  };
}

function failureForMediaError(error: unknown): DirectedCallWebRtcFailureCode {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "microphone_unavailable";
  return "microphone_unavailable";
}

function candidateKey(candidate: RTCIceCandidateInit): string {
  return JSON.stringify([
    candidate.candidate,
    candidate.sdpMid ?? null,
    candidate.sdpMLineIndex ?? null,
    candidate.usernameFragment ?? null,
  ]);
}

/** Isolated audio-only WebRTC primitive for persistent calls. */
export class DirectedCallWebRtcAdapter {
  private readonly dependencies: DirectedCallWebRtcAdapterDependencies;
  private readonly onIceCandidate?: (candidate: RTCIceCandidateInit) => void | Promise<void>;
  private readonly onRemoteStream?: (stream: DirectedCallMediaStream) => void;
  private readonly onPeerConnectionState?: (state: RTCPeerConnectionState) => void;
  private readonly queuedCandidates: RTCIceCandidateInit[] = [];
  private readonly seenCandidates = new Set<string>();
  private peerConnection: PeerConnectionLike | null = null;
  private localStream: DirectedCallMediaStream | null = null;
  private remoteStream: DirectedCallMediaStream | null = null;
  private disposed = false;
  private offerPrepared = false;
  private epoch = 0;
  private localAudioMuted = false;

  constructor(options: DirectedCallWebRtcAdapterOptions = {}) {
    const dependencies = defaultDependencies();
    this.dependencies = { ...dependencies, ...options.dependencies };
    this.onIceCandidate = options.onIceCandidate;
    this.onRemoteStream = options.onRemoteStream;
    this.onPeerConnectionState = options.onPeerConnectionState;
  }

  get localMediaStream(): DirectedCallMediaStream | null {
    return this.localStream;
  }

  get remoteMediaStream(): DirectedCallMediaStream | null {
    return this.remoteStream;
  }

  get isLocalAudioMuted(): boolean {
    return this.localAudioMuted;
  }

  setLocalAudioMuted(muted: boolean): boolean {
    const tracks = this.localStream?.getTracks().filter((track) =>
      (track.kind === undefined || track.kind === "audio") && track.readyState !== "ended",
    ) ?? [];
    if (tracks.length === 0) return false;
    this.localAudioMuted = muted;
    tracks.forEach((track) => { track.enabled = !muted; });
    return true;
  }

  async prepareOffer(): Promise<RTCSessionDescriptionInit> {
    const epoch = this.epoch;
    await this.ensureAudioPeer(epoch);
    this.assertCurrent(epoch);
    if (this.offerPrepared && this.peerConnection?.localDescription) return this.peerConnection.localDescription;
    try {
      const offer = await this.peerConnection!.createOffer();
      this.assertCurrent(epoch);
      await this.peerConnection!.setLocalDescription(offer);
      this.assertCurrent(epoch);
      this.offerPrepared = true;
      return offer;
    } catch {
      if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async prepareAnswer(): Promise<void> {
    const epoch = this.epoch;
    await this.ensureAudioPeer(epoch);
    this.assertCurrent(epoch);
  }

  async acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    const epoch = this.epoch;
    await this.ensureAudioPeer(epoch);
    this.assertCurrent(epoch);
    if (this.peerConnection!.remoteDescription?.type === "offer") return null;
    try {
      await this.peerConnection!.setRemoteDescription(offer);
      this.assertCurrent(epoch);
      await this.flushQueuedCandidates(epoch);
      const answer = await this.peerConnection!.createAnswer();
      this.assertCurrent(epoch);
      await this.peerConnection!.setLocalDescription(answer);
      this.assertCurrent(epoch);
      return answer;
    } catch {
      if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<boolean> {
    const epoch = this.epoch;
    await this.ensureAudioPeer(epoch);
    this.assertCurrent(epoch);
    if (this.peerConnection!.remoteDescription?.type === "answer") return false;
    try {
      await this.peerConnection!.setRemoteDescription(answer);
      this.assertCurrent(epoch);
      await this.flushQueuedCandidates(epoch);
      this.assertCurrent(epoch);
      return true;
    } catch {
      if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async addRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<boolean> {
    const epoch = this.epoch;
    if (!this.isCurrent(epoch) || this.seenCandidates.has(candidateKey(candidate))) return false;
    this.seenCandidates.add(candidateKey(candidate));
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.queuedCandidates.push(candidate);
      return true;
    }
    try {
      await this.peerConnection.addIceCandidate(candidate);
      this.assertCurrent(epoch);
      return true;
    } catch {
      if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
      throw new DirectedCallWebRtcError("ice_failed");
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    this.queuedCandidates.length = 0;
    this.seenCandidates.clear();
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.ontrack = null;
    }
    this.peerConnection?.close();
    this.peerConnection = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.remoteStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.offerPrepared = false;
    this.localAudioMuted = false;
  }

  private async ensureAudioPeer(epoch: number): Promise<void> {
    this.assertCurrent(epoch);
    if (this.peerConnection && this.localStream) return;
    let acquiredStream: DirectedCallMediaStream | null = null;
    try {
      acquiredStream = await this.dependencies.getUserMedia({ audio: true, video: false });
      this.assertCurrent(epoch);
    } catch (error) {
      if (error instanceof DirectedCallWebRtcStaleError || !this.isCurrent(epoch)) {
        acquiredStream?.getTracks().forEach((track) => track.stop());
        throw new DirectedCallWebRtcStaleError();
      }
      throw new DirectedCallWebRtcError(failureForMediaError(error));
    }
    this.localStream = acquiredStream;
    this.localStream.getTracks().forEach((track) => {
      if ((track.kind === undefined || track.kind === "audio") && track.readyState !== "ended") {
        track.enabled = !this.localAudioMuted;
      }
    });
    try {
      this.peerConnection = this.dependencies.createPeerConnection();
      this.assertCurrent(epoch);
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.isCurrent(epoch)) {
          const candidate = typeof event.candidate.toJSON === "function"
            ? event.candidate.toJSON()
            : {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                usernameFragment: event.candidate.usernameFragment,
              };
          void this.onIceCandidate?.(candidate);
        }
      };
      this.peerConnection.onconnectionstatechange = () => {
        if (this.isCurrent(epoch) && this.peerConnection?.connectionState) this.onPeerConnectionState?.(this.peerConnection.connectionState);
      };
      this.peerConnection.ontrack = (event) => {
        if (!this.isCurrent(epoch)) return;
        this.remoteStream = event.streams[0] ?? this.remoteStream ?? this.dependencies.createRemoteStream?.() ?? null;
        if (!event.streams[0]) this.remoteStream?.addTrack?.(event.track);
        if (this.remoteStream) this.onRemoteStream?.(this.remoteStream);
      };
      for (const track of this.localStream.getTracks()) {
        this.assertCurrent(epoch);
        this.peerConnection.addTrack(track, this.localStream);
      }
    } catch {
      this.localStream?.getTracks().forEach((track) => track.stop());
      this.localStream = null;
      if (this.peerConnection) {
        this.peerConnection.onicecandidate = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.ontrack = null;
      }
      this.peerConnection?.close();
      this.peerConnection = null;
      if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
      throw new DirectedCallWebRtcError("media_binding_failed");
    }
  }

  private async flushQueuedCandidates(epoch: number): Promise<void> {
    const queued = this.queuedCandidates.splice(0);
    for (const candidate of queued) {
      try {
        await this.peerConnection!.addIceCandidate(candidate);
        this.assertCurrent(epoch);
      } catch {
        if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
        throw new DirectedCallWebRtcError("ice_failed");
      }
    }
  }

  private isCurrent(epoch: number): boolean {
    return !this.disposed && epoch === this.epoch;
  }

  private assertCurrent(epoch: number): void {
    if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
  }
}
