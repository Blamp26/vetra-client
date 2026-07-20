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

export interface DirectedCallMediaStreamTrack {
  stop(): void;
}

export interface DirectedCallMediaStream {
  getTracks(): DirectedCallMediaStreamTrack[];
  addTrack?(track: DirectedCallMediaStreamTrack): void;
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

  async prepareOffer(): Promise<RTCSessionDescriptionInit> {
    await this.ensureAudioPeer();
    if (this.offerPrepared && this.peerConnection?.localDescription) return this.peerConnection.localDescription;
    try {
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);
      this.offerPrepared = true;
      return offer;
    } catch {
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async prepareAnswer(): Promise<void> {
    await this.ensureAudioPeer();
  }

  async acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    await this.ensureAudioPeer();
    if (this.peerConnection!.remoteDescription?.type === "offer") return null;
    try {
      await this.peerConnection!.setRemoteDescription(offer);
      await this.flushQueuedCandidates();
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);
      return answer;
    } catch {
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<boolean> {
    await this.ensureAudioPeer();
    if (this.peerConnection!.remoteDescription?.type === "answer") return false;
    try {
      await this.peerConnection!.setRemoteDescription(answer);
      await this.flushQueuedCandidates();
      return true;
    } catch {
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async addRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<boolean> {
    if (this.disposed || this.seenCandidates.has(candidateKey(candidate))) return false;
    this.seenCandidates.add(candidateKey(candidate));
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.queuedCandidates.push(candidate);
      return true;
    }
    try {
      await this.peerConnection.addIceCandidate(candidate);
      return true;
    } catch {
      throw new DirectedCallWebRtcError("ice_failed");
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queuedCandidates.length = 0;
    this.seenCandidates.clear();
    this.peerConnection?.close();
    this.peerConnection = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.remoteStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.offerPrepared = false;
  }

  private async ensureAudioPeer(): Promise<void> {
    if (this.disposed) throw new DirectedCallWebRtcError("peer_connection_failed");
    if (this.peerConnection && this.localStream) return;
    try {
      this.localStream = await this.dependencies.getUserMedia({ audio: true, video: false });
    } catch (error) {
      throw new DirectedCallWebRtcError(failureForMediaError(error));
    }
    try {
      this.peerConnection = this.dependencies.createPeerConnection();
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && !this.disposed) {
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
        if (this.peerConnection?.connectionState) this.onPeerConnectionState?.(this.peerConnection.connectionState);
      };
      this.peerConnection.ontrack = (event) => {
        if (this.disposed) return;
        this.remoteStream = event.streams[0] ?? this.remoteStream ?? this.dependencies.createRemoteStream?.() ?? null;
        if (!event.streams[0]) this.remoteStream?.addTrack?.(event.track);
        if (this.remoteStream) this.onRemoteStream?.(this.remoteStream);
      };
      for (const track of this.localStream.getTracks()) this.peerConnection.addTrack(track, this.localStream);
    } catch {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
      this.peerConnection?.close();
      this.peerConnection = null;
      throw new DirectedCallWebRtcError("media_binding_failed");
    }
  }

  private async flushQueuedCandidates(): Promise<void> {
    const queued = this.queuedCandidates.splice(0);
    for (const candidate of queued) {
      try {
        await this.peerConnection!.addIceCandidate(candidate);
      } catch {
        throw new DirectedCallWebRtcError("ice_failed");
      }
    }
  }
}
