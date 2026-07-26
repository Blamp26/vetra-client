import { createDirectedCallUuid } from "./directedCallDevice";
import {
  createDefaultRtcConfigurationSource,
  resolveRtcConfiguration,
  type RtcConfigurationSource,
} from "./iceServerConfig";
import { buildMicrophoneConstraints, DEFAULT_AUDIO_PREFERENCES } from "@/shared/utils/audioConstraints";
import { isCallDebugEnabled } from "../utils/callDebug";

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
  removeTrack?(track: DirectedCallMediaStreamTrack): void;
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
}

interface ScreenShareTransceiverLike {
  kind?: string;
  direction: RTCRtpTransceiverDirection;
  currentDirection?: RTCRtpTransceiverDirection | null;
  mid?: string | null;
  sender: {
    track: DirectedCallMediaStreamTrack | null;
    replaceTrack(track: DirectedCallMediaStreamTrack | null): Promise<void>;
  };
  receiver?: {
    track?: DirectedCallMediaStreamTrack | null;
  };
  stop?(): void;
}

interface PeerConnectionLike {
  connectionState?: RTCPeerConnectionState;
  iceConnectionState?: RTCIceConnectionState;
  iceGatheringState?: RTCIceGatheringState;
  signalingState?: RTCSignalingState;
  onconnectionstatechange: ((event: Event) => void) | null;
  oniceconnectionstatechange?: ((event: Event) => void) | null;
  onicegatheringstatechange?: ((event: Event) => void) | null;
  onsignalingstatechange?: ((event: Event) => void) | null;
  localDescription: RTCSessionDescription | null;
  remoteDescription: RTCSessionDescription | null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
  ontrack: ((event: RTCTrackEvent) => void) | null;
  addTrack(track: DirectedCallMediaStreamTrack, stream: DirectedCallMediaStream): unknown;
  addTransceiver?(trackOrKind: string, init?: { direction?: RTCRtpTransceiverDirection }): ScreenShareTransceiverLike;
  getTransceivers?(): ScreenShareTransceiverLike[];
  getSenders?(): Array<{
    track: DirectedCallMediaStreamTrack | null;
    replaceTrack(track: DirectedCallMediaStreamTrack | null): Promise<void>;
  }>;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(): void;
}

export interface DirectedCallWebRtcAdapterDependencies {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<DirectedCallMediaStream>;
  getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<DirectedCallMediaStream>;
  createPeerConnection: (configuration?: RTCConfiguration) => PeerConnectionLike;
  createRemoteStream?: () => DirectedCallMediaStream;
  createSignalId?: () => string;
}

export interface DirectedCallWebRtcAdapterOptions {
  dependencies?: DirectedCallWebRtcAdapterDependencies;
  rtcConfigurationSource?: RtcConfigurationSource;
  getAudioConstraints?: () => MediaStreamConstraints;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void | Promise<void>;
  onRemoteStream?: (stream: DirectedCallMediaStream) => void;
  onRemoteScreenShareChanged?: (stream: DirectedCallMediaStream | null) => void;
  onInitialMediaReadinessChange?: (readiness: DirectedCallInitialMediaReadiness) => void;
  onPeerConnectionState?: (state: RTCPeerConnectionState) => void;
  onPeerConnectionDiagnostics?: (diagnostics: DirectedCallPeerConnectionDiagnostics) => void;
  onDiagnostic?: (event: "peer_connection" | "remote_video_ontrack" | "remote_screen_stream_created" | "remote_screen_stream_updated" | "remote_screen_stream_cleared", details: DirectedCallWebRtcDiagnosticDetails) => void;
}

export interface DirectedCallWebRtcDiagnosticDetails {
  diagnosticStage?: DirectedCallWebRtcDiagnosticStage;
  diagnosticReason?: DirectedCallWebRtcDiagnosticReason;
  transceiverMid?: string | null;
  eventTransceiverPresent?: boolean;
  eventTransceiverMid?: string | null;
  expectedScreenTransceiverMid?: string | null;
  transceiverIdentityMatch?: boolean | null;
  receiverTrackIdentity?: "match" | "mismatch" | "unavailable";
  eventSenderTrackPresent?: boolean;
  expectedSenderTrackPresent?: boolean;
  eventReceiverTrackPresent?: boolean;
  expectedReceiverTrackPresent?: boolean;
  associationStrategy?: "strict_identity" | "owned_transceiver" | "event_transceiver" | "offer_mid" | "receiver_track_identity";
  associationAccepted?: boolean;
  videoTransceiverIndex?: number | null;
  videoTransceiverCount?: number | null;
  selectedScreenTransceiver?: boolean;
  localScreenSenderTransceiver?: boolean;
  transceiverCurrentDirection?: string | null;
  transceiverDirection?: string | null;
  localVideoDirection?: string | null;
  remoteVideoDirection?: string | null;
  senderTrackPresent?: boolean;
  receiverTrackPresent?: boolean;
  remoteTrackKind?: string;
  remoteTrackReadyState?: string;
  remoteTrackMuted?: boolean;
  browserStreamPresent?: boolean;
  remoteStreamPresent?: boolean;
  remoteStreamSource?: "browser-provided" | "adapter-created";
  videoMLineCount?: number;
  videoMLineIndex?: number;
  videoMLineMid?: string | null;
  videoMLineDirection?: "sendonly" | "recvonly" | "sendrecv" | "inactive" | "missing";
  videoMLineRejected?: boolean;
}

export type DirectedCallWebRtcDiagnosticStage =
  | "ontrack_received"
  | "association_checked"
  | "association_rejected"
  | "duplicate_suppressed"
  | "stream_construction"
  | "track_addition"
  | "ended_listener"
  | "stream_assigned"
  | "publication_callback"
  | "publication_reconciled"
  | "transceiver_snapshot"
  | "sdp_summary"
  | "before_create_offer"
  | "after_set_local_offer"
  | "after_set_remote_offer"
  | "before_create_answer"
  | "after_create_answer"
  | "after_set_local_answer"
  | "after_set_remote_answer";

export type DirectedCallWebRtcDiagnosticReason =
  | "started"
  | "succeeded"
  | "failed"
  | "track_ended"
  | "reception_disabled"
  | "missing_transceiver"
  | "transceiver_identity_mismatch"
  | "duplicate_track"
  | "stream_unavailable"
  | "stream_constructor_failed"
  | "stream_inspection_failed"
  | "add_track_unavailable"
  | "add_track_failed"
  | "listener_unavailable"
  | "listener_binding_failed"
  | "publication_callback_failed"
  | "diagnostic_read_failed"
  | "before_create_offer"
  | "after_set_local_offer"
  | "after_set_remote_offer"
  | "before_create_answer"
  | "after_create_answer"
  | "after_set_local_answer"
  | "after_set_remote_answer";

export type DirectedCallLocalScreenShareEndedHandler = () => void;
export type DirectedCallRemoteScreenShareChangedHandler = (stream: DirectedCallMediaStream | null) => void;

export interface DirectedCallInitialMediaReadiness {
  readonly transportConnected: boolean;
  readonly localAudioSenderReady: boolean;
  readonly remoteAudioTrackReady: boolean;
  readonly remoteAudioStreamBound: boolean;
  readonly ready: boolean;
}

export interface DirectedCallPeerConnectionDiagnostics {
  connectionState: RTCPeerConnectionState | "unknown";
  iceConnectionState: RTCIceConnectionState | "unknown";
  iceGatheringState: RTCIceGatheringState | "unknown";
  signalingState: RTCSignalingState | "unknown";
}

function defaultDependencies(): DirectedCallWebRtcAdapterDependencies {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
    createPeerConnection: (configuration) => new RTCPeerConnection(configuration),
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

function videoDirection(sdp: string): string | null {
  const mediaSection = sdp.split(/\r?\n(?=m=)/).find((section) => section.startsWith("m=video"));
  if (!mediaSection) return null;
  const direction = mediaSection.match(/(?:^|\r?\n)(sendrecv|sendonly|recvonly|inactive)(?:\r?\n|$)/)?.[1];
  return direction ?? null;
}

const MAX_VIDEO_DIAGNOSTIC_ITEMS = 8;

interface VideoSdpSummary {
  mid: string | null;
  direction: "sendonly" | "recvonly" | "sendrecv" | "inactive" | "missing";
  rejected: boolean;
}

function videoSdpSummaries(sdp: string): VideoSdpSummary[] {
  return sdp
    .split(/(?=m=)/)
    .filter((section) => section.startsWith("m=video"))
    .slice(0, MAX_VIDEO_DIAGNOSTIC_ITEMS)
    .map((section) => {
      const firstLine = section.split(/\r?\n/, 1)[0] ?? "";
      const port = Number(firstLine.split(/\s+/, 3)[1]);
      const mid = section.match(/(?:^|\r?\n)a=mid:([^\r\n]+)/)?.[1] ?? null;
      const direction = section.match(/(?:^|\r?\n)a?=(sendrecv|sendonly|recvonly|inactive)(?:\r?\n|$)/)?.[1]
        ?? "missing";
      return {
        mid,
        direction: direction as VideoSdpSummary["direction"],
        rejected: port === 0,
      };
    });
}

function initialMediaReadiness(values: Omit<DirectedCallInitialMediaReadiness, "ready">): DirectedCallInitialMediaReadiness {
  return Object.freeze({
    ...values,
    ready: values.transportConnected
      && values.localAudioSenderReady
      && values.remoteAudioTrackReady
      && values.remoteAudioStreamBound,
  });
}

/** Isolated audio-only WebRTC primitive for persistent calls. */
export class DirectedCallWebRtcAdapter {
  private readonly dependencies: DirectedCallWebRtcAdapterDependencies;
  private readonly rtcConfigurationSource: RtcConfigurationSource;
  private readonly onIceCandidate?: (candidate: RTCIceCandidateInit) => void | Promise<void>;
  private readonly onRemoteStream?: (stream: DirectedCallMediaStream) => void;
  private readonly onRemoteScreenShareChange?: DirectedCallRemoteScreenShareChangedHandler;
  private readonly onInitialMediaReadinessChange?: (readiness: DirectedCallInitialMediaReadiness) => void;
  private readonly onPeerConnectionState?: (state: RTCPeerConnectionState) => void;
  private readonly onPeerConnectionDiagnostics?: (diagnostics: DirectedCallPeerConnectionDiagnostics) => void;
  private readonly onDiagnostic?: DirectedCallWebRtcAdapterOptions["onDiagnostic"];
  private readonly getAudioConstraints: () => MediaStreamConstraints;
  private readonly queuedCandidates: RTCIceCandidateInit[] = [];
  private readonly seenCandidates = new Set<string>();
  private peerConnection: PeerConnectionLike | null = null;
  private localStream: DirectedCallMediaStream | null = null;
  private remoteStream: DirectedCallMediaStream | null = null;
  private remoteAudioTrack: DirectedCallMediaStreamTrack | null = null;
  private remoteAudioStreamBound = false;
  private readonly readinessTrackCleanups = new Map<DirectedCallMediaStreamTrack, () => void>();
  private readonly localReadinessTracks = new Set<DirectedCallMediaStreamTrack>();
  private peerCreation: { epoch: number; promise: Promise<void> } | null = null;
  private initialMediaReadiness = initialMediaReadiness({
    transportConnected: false,
    localAudioSenderReady: false,
    remoteAudioTrackReady: false,
    remoteAudioStreamBound: false,
  });
  private disposed = false;
  private offerPrepared = false;
  private epoch = 0;
  private localAudioMuted = false;
  private audioSwitchEpoch = 0;
  private audioReplacementTail: Promise<void> = Promise.resolve();
  private screenShareTransceiver: ScreenShareTransceiverLike | null = null;
  private readonly retiredScreenTransceivers = new WeakSet<object>();
  private readonly videoTransceiverIndices = new WeakMap<object, number>();
  private nextVideoTransceiverIndex = 0;
  private localScreenShareEnabled = false;
  private remoteScreenShareReceptionEnabled = false;
  private remoteScreenShareStream: DirectedCallMediaStream | null = null;
  private remoteScreenShareStreamSource: "browser-provided" | "adapter-created" | null = null;
  private remoteScreenShareTrack: DirectedCallMediaStreamTrack | null = null;
  private remoteScreenShareTrackEndedListener: EventListener | null = null;
  private remoteScreenShareChangedHandler: DirectedCallRemoteScreenShareChangedHandler | null = null;
  private localScreenShareStream: DirectedCallMediaStream | null = null;
  private localScreenShareTrack: DirectedCallMediaStreamTrack | null = null;
  private localScreenShareTrackEndedListener: EventListener | null = null;
  private localScreenShareEndedHandler: DirectedCallLocalScreenShareEndedHandler | null = null;
  private pendingScreenShare: Promise<boolean> | null = null;
  private screenShareEpoch = 0;

  constructor(options: DirectedCallWebRtcAdapterOptions = {}) {
    const dependencies = defaultDependencies();
    this.dependencies = { ...dependencies, ...options.dependencies };
    this.rtcConfigurationSource = options.rtcConfigurationSource ?? createDefaultRtcConfigurationSource();
    this.onIceCandidate = options.onIceCandidate;
    this.onRemoteStream = options.onRemoteStream;
    this.onRemoteScreenShareChange = options.onRemoteScreenShareChanged;
    this.onInitialMediaReadinessChange = options.onInitialMediaReadinessChange;
    this.onPeerConnectionState = options.onPeerConnectionState;
    this.onPeerConnectionDiagnostics = options.onPeerConnectionDiagnostics;
    this.onDiagnostic = options.onDiagnostic;
    this.getAudioConstraints = options.getAudioConstraints
      ?? (() => buildMicrophoneConstraints(DEFAULT_AUDIO_PREFERENCES));
  }

  get localMediaStream(): DirectedCallMediaStream | null {
    return this.localStream;
  }

  get remoteMediaStream(): DirectedCallMediaStream | null {
    return this.remoteStream;
  }

  get initialMediaReadinessSnapshot(): DirectedCallInitialMediaReadiness {
    return this.initialMediaReadiness;
  }

  get isLocalAudioMuted(): boolean {
    return this.localAudioMuted;
  }

  /** The adapter owns this stream until explicit stop, browser end, or disposal. */
  getLocalScreenShareStream(): DirectedCallMediaStream | null {
    return this.localScreenShareStream;
  }

  onLocalScreenShareEnded(handler: DirectedCallLocalScreenShareEndedHandler): () => void {
    this.localScreenShareEndedHandler = handler;
    return () => {
      if (this.localScreenShareEndedHandler === handler) this.localScreenShareEndedHandler = null;
    };
  }

  getRemoteScreenShareStream(): DirectedCallMediaStream | null {
    return this.remoteScreenShareStream;
  }

  get hasRemoteDescription(): boolean {
    return Boolean(this.peerConnection?.remoteDescription);
  }

  onRemoteScreenShareChanged(handler: DirectedCallRemoteScreenShareChangedHandler): () => void {
    let active = true;
    this.remoteScreenShareChangedHandler = handler;
    return () => {
      if (!active) return;
      active = false;
      if (this.remoteScreenShareChangedHandler === handler) this.remoteScreenShareChangedHandler = null;
    };
  }

  setRemoteScreenShareReceptionEnabled(enabled: boolean): boolean {
    if (this.disposed || !this.peerConnection) return false;
    if (!enabled && !this.screenShareTransceiver) {
      this.remoteScreenShareReceptionEnabled = false;
      return true;
    }
    if (enabled && !this.ensureScreenShareTransceiver()) return false;
    this.remoteScreenShareReceptionEnabled = enabled;
    this.updateScreenShareTransceiverDirection();
    return true;
  }

  reconcileRemoteScreenShareState(enabled: boolean): void {
    if (this.disposed || enabled) return;
    this.clearRemoteScreenShare(true);
  }

  startScreenShare(): Promise<boolean> {
    if (this.localScreenShareTrack) return Promise.resolve(true);
    if (this.pendingScreenShare) return this.pendingScreenShare;

    const epoch = this.epoch;
    const screenShareEpoch = ++this.screenShareEpoch;
    const operation = this.startScreenShareOperation(epoch, screenShareEpoch);
    this.pendingScreenShare = operation;
    void operation.then(() => {
      if (this.pendingScreenShare === operation) this.pendingScreenShare = null;
    }, () => {
      if (this.pendingScreenShare === operation) this.pendingScreenShare = null;
    });
    return operation;
  }

  stopScreenShare(): void {
    this.screenShareEpoch += 1;
    this.clearLocalScreenShare(false);
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

  async switchAudioInput(constraints: MediaStreamConstraints): Promise<boolean> {
    const epoch = this.epoch;
    const switchEpoch = ++this.audioSwitchEpoch;
    if (!this.isCurrent(epoch) || !this.peerConnection || !this.localStream) return false;

    const switchPromise = this.audioReplacementTail.then(async () => {
      if (!this.isCurrent(epoch) || switchEpoch !== this.audioSwitchEpoch || !this.peerConnection || !this.localStream) return false;
      const sender = this.peerConnection.getSenders?.().find((candidate) =>
        candidate.track && (candidate.track.kind === undefined || candidate.track.kind === "audio"),
      );
      if (!sender) return false;

      let newStream: DirectedCallMediaStream | null = null;
      try {
        newStream = await this.dependencies.getUserMedia(constraints);
        if (!this.isCurrent(epoch) || switchEpoch !== this.audioSwitchEpoch) {
          newStream.getTracks().forEach((track) => track.stop());
          return false;
        }
        const newAudioTrack = newStream.getTracks().find((track) =>
          (track.kind === undefined || track.kind === "audio") && track.readyState !== "ended",
        );
        if (!newAudioTrack) {
          newStream.getTracks().forEach((track) => track.stop());
          return false;
        }
        newAudioTrack.enabled = !this.localAudioMuted;
        await sender.replaceTrack(newAudioTrack);
        if (!this.isCurrent(epoch) || switchEpoch !== this.audioSwitchEpoch) {
          newStream.getTracks().forEach((track) => track.stop());
          return false;
        }

        const oldStream = this.localStream;
        this.localStream = newStream;
        this.clearLocalReadinessTrackListeners();
        newStream.getTracks().forEach((track) => this.bindReadinessTrack(track, epoch, "local"));
        oldStream.getTracks().forEach((track) => track.stop());
        newStream.getTracks().forEach((track) => {
          if (track !== newAudioTrack) track.stop();
        });
        this.recomputeInitialMediaReadiness(epoch);
        return true;
      } catch {
        newStream?.getTracks().forEach((track) => track.stop());
        return false;
      }
    });
    this.audioReplacementTail = switchPromise.then(() => undefined, () => undefined);
    return switchPromise;
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
      await this.adoptAuthoritativeScreenTransceiver(offer.sdp);
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

  /** Post-active SDP operations are separate from the initial establishment guards. */
  async createRenegotiationOffer(): Promise<RTCSessionDescriptionInit> {
    const epoch = this.epoch;
    await this.ensureAudioPeer(epoch);
    this.assertCurrent(epoch);
    try {
      this.emitVideoTransceiverDiagnostics("before_create_offer", "before_create_offer");
      const offer = await this.peerConnection!.createOffer();
      this.assertCurrent(epoch);
      await this.peerConnection!.setLocalDescription(offer);
      this.assertCurrent(epoch);
      this.emitVideoTransceiverDiagnostics("after_set_local_offer", "after_set_local_offer", offer.sdp);
      this.emitTransceiverDiagnostic("peer_connection", offer.sdp ?? undefined, undefined);
      return offer;
    } catch {
      if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async applyRenegotiationOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    const epoch = this.epoch;
    await this.ensureAudioPeer(epoch);
    this.assertCurrent(epoch);
    try {
      await this.peerConnection!.setRemoteDescription(offer);
      this.assertCurrent(epoch);
      await this.adoptAuthoritativeScreenTransceiver(offer.sdp);
      this.emitVideoTransceiverDiagnostics("after_set_remote_offer", "after_set_remote_offer", offer.sdp);
      this.emitTransceiverDiagnostic("peer_connection", undefined, offer.sdp);
      await this.flushQueuedCandidates(epoch);
    } catch {
      if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async createRenegotiationAnswer(): Promise<RTCSessionDescriptionInit> {
    const epoch = this.epoch;
    await this.ensureAudioPeer(epoch);
    this.assertCurrent(epoch);
    try {
      this.emitVideoTransceiverDiagnostics("before_create_answer", "before_create_answer");
      const answer = await this.peerConnection!.createAnswer();
      this.assertCurrent(epoch);
      this.emitVideoTransceiverDiagnostics("after_create_answer", "after_create_answer", answer.sdp);
      await this.peerConnection!.setLocalDescription(answer);
      this.assertCurrent(epoch);
      this.emitVideoTransceiverDiagnostics("after_set_local_answer", "after_set_local_answer", answer.sdp);
      this.emitTransceiverDiagnostic("peer_connection", undefined, answer.sdp);
      return answer;
    } catch {
      if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
      throw new DirectedCallWebRtcError("sdp_failed");
    }
  }

  async applyRenegotiationAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const epoch = this.epoch;
    await this.ensureAudioPeer(epoch);
    this.assertCurrent(epoch);
    try {
      await this.peerConnection!.setRemoteDescription(answer);
      this.assertCurrent(epoch);
      this.emitVideoTransceiverDiagnostics("after_set_remote_answer", "after_set_remote_answer", answer.sdp);
      this.emitTransceiverDiagnostic("peer_connection", undefined, answer.sdp);
      await this.flushQueuedCandidates(epoch);
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
    this.peerCreation = null;
    this.audioSwitchEpoch += 1;
    this.screenShareEpoch += 1;
    this.clearLocalScreenShare(false);
    this.queuedCandidates.length = 0;
    this.seenCandidates.clear();
    this.clearReadinessTrackListeners();
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onicegatheringstatechange = null;
      this.peerConnection.onsignalingstatechange = null;
      this.peerConnection.ontrack = null;
    }
    this.peerConnection?.close();
    this.peerConnection = null;
    this.clearRemoteScreenShare(false);
    this.screenShareTransceiver = null;
    this.localScreenShareEnabled = false;
    this.remoteScreenShareReceptionEnabled = false;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.remoteStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.remoteAudioTrack = null;
    this.remoteAudioStreamBound = false;
    this.offerPrepared = false;
    this.localAudioMuted = false;
    this.emitInitialMediaReadiness(initialMediaReadiness({
      transportConnected: false,
      localAudioSenderReady: false,
      remoteAudioTrackReady: false,
      remoteAudioStreamBound: false,
    }));
  }

  private async startScreenShareOperation(epoch: number, screenShareEpoch: number): Promise<boolean> {
    let stream: DirectedCallMediaStream | null = null;
    try {
      await this.ensureAudioPeer(epoch);
      if (!this.isCurrent(epoch) || screenShareEpoch !== this.screenShareEpoch) return false;

      stream = await this.dependencies.getDisplayMedia!({ video: true, audio: false });
      if (!this.isCurrent(epoch) || screenShareEpoch !== this.screenShareEpoch) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const track = stream.getTracks().find((candidate) =>
        (candidate.kind === undefined || candidate.kind === "video") && candidate.readyState !== "ended",
      );
      if (!track || !this.peerConnection?.addTransceiver) {
        stream.getTracks().forEach((candidate) => candidate.stop());
        return false;
      }

      this.localScreenShareEnabled = true;
      if (!this.ensureScreenShareTransceiver()) {
        this.localScreenShareEnabled = false;
        stream.getTracks().forEach((candidate) => candidate.stop());
        return false;
      }
      this.updateScreenShareTransceiverDirection();
      if (!this.isCurrent(epoch) || screenShareEpoch !== this.screenShareEpoch || !this.screenShareTransceiver) {
        this.localScreenShareEnabled = false;
        this.updateScreenShareTransceiverDirection();
        stream.getTracks().forEach((candidate) => candidate.stop());
        return false;
      }
      await this.screenShareTransceiver.sender.replaceTrack(track);
      if (!this.isCurrent(epoch) || screenShareEpoch !== this.screenShareEpoch) {
        this.localScreenShareEnabled = false;
        this.updateScreenShareTransceiverDirection();
        this.detachScreenShareTrack();
        stream.getTracks().forEach((candidate) => candidate.stop());
        return false;
      }
      this.localScreenShareStream = stream;
      this.localScreenShareTrack = track;
      const endedHandler = () => {
        if (this.localScreenShareTrack !== track) return;
        this.clearLocalScreenShare(true);
      };
      this.localScreenShareTrackEndedListener = endedHandler as EventListener;
      track.addEventListener?.("ended", this.localScreenShareTrackEndedListener);
      return true;
    } catch (error) {
      this.localScreenShareEnabled = false;
      this.updateScreenShareTransceiverDirection();
      stream?.getTracks().forEach((candidate) => candidate.stop());
      if (error instanceof DirectedCallWebRtcStaleError || !this.isCurrent(epoch) || screenShareEpoch !== this.screenShareEpoch) return false;
      return false;
    }
  }

  private clearLocalScreenShare(notify: boolean): void {
    const track = this.localScreenShareTrack;
    const stream = this.localScreenShareStream;
    this.localScreenShareTrack = null;
    this.localScreenShareStream = null;
    this.localScreenShareEnabled = false;
    this.updateScreenShareTransceiverDirection();
    if (track) {
      // Remove the listener before stop: browser and test implementations may emit ended from stop().
      if (this.localScreenShareTrackEndedListener) {
        track.removeEventListener?.("ended", this.localScreenShareTrackEndedListener);
        this.localScreenShareTrackEndedListener = null;
      }
    }
    if (track) this.detachScreenShareTrack();
    stream?.getTracks().forEach((ownedTrack) => ownedTrack.stop());
    if (notify) this.localScreenShareEndedHandler?.();
  }

  private detachScreenShareTrack(): void {
    const sender = this.screenShareTransceiver?.sender;
    if (!sender) return;
    // Detach is best-effort; synchronous local cleanup must not await or propagate its failure.
    void sender.replaceTrack(null).catch(() => undefined);
  }

  private ensureScreenShareTransceiver(transceiver?: ScreenShareTransceiverLike): ScreenShareTransceiverLike | null {
    if (this.screenShareTransceiver) return this.screenShareTransceiver;
    if (transceiver) {
      this.screenShareTransceiver = transceiver;
      return transceiver;
    }
    if (!this.peerConnection?.addTransceiver) return null;
    this.screenShareTransceiver = this.peerConnection.addTransceiver("video", {
      direction: this.screenShareDirection(),
    });
    return this.screenShareTransceiver;
  }

  private screenShareDirection(): RTCRtpTransceiverDirection {
    if (this.localScreenShareEnabled && this.remoteScreenShareReceptionEnabled) return "sendrecv";
    if (this.localScreenShareEnabled) return "sendonly";
    if (this.remoteScreenShareReceptionEnabled) return "recvonly";
    return "inactive";
  }

  private updateScreenShareTransceiverDirection(): void {
    if (this.screenShareTransceiver) this.screenShareTransceiver.direction = this.screenShareDirection();
  }

  private isRetiredScreenTransceiver(transceiver?: ScreenShareTransceiverLike): boolean {
    return Boolean(transceiver && this.retiredScreenTransceivers.has(transceiver as unknown as object));
  }

  private rebindScreenShareTransceiver(
    transceiver: ScreenShareTransceiverLike,
    associationStrategy: "offer_mid" | "receiver_track_identity" | "event_transceiver",
  ): boolean {
    if (this.isRetiredScreenTransceiver(transceiver)) return false;
    const previous = this.screenShareTransceiver;
    if (previous === transceiver) return true;

    if (previous) {
      this.retiredScreenTransceivers.add(previous as unknown as object);
      previous.direction = "inactive";
      if (previous.sender.track) void previous.sender.replaceTrack(null).catch(() => undefined);
    }
    this.screenShareTransceiver = transceiver;
    this.emitDiagnostic("peer_connection", {
      diagnosticStage: "association_checked",
      diagnosticReason: "succeeded",
      associationStrategy,
      associationAccepted: true,
      ...this.transceiverDiagnosticDetails(),
    });
    return true;
  }

  private async migrateLocalScreenShareTrack(): Promise<void> {
    const transceiver = this.screenShareTransceiver;
    const track = this.localScreenShareTrack;
    if (!transceiver || !track || transceiver.sender.track === track) return;
    await transceiver.sender.replaceTrack(track);
  }

  private async adoptAuthoritativeScreenTransceiver(sdp?: string): Promise<boolean> {
    const summaries = videoSdpSummaries(sdp ?? "")
      .filter((summary) => !summary.rejected && summary.mid !== null);
    if (summaries.length === 0) return false;

    let transceivers: ScreenShareTransceiverLike[] = [];
    try {
      transceivers = this.peerConnection?.getTransceivers?.() ?? [];
    } catch {
      return false;
    }
    for (const summary of summaries) {
      const mid = summary.mid;
      const candidate = transceivers.find((transceiver) =>
        !this.isRetiredScreenTransceiver(transceiver)
        && transceiver.mid === mid,
      );
      if (!candidate) continue;
      const adopted = this.adoptRemoteScreenTransceiver(
        candidate,
        undefined,
        summary.direction === "sendonly" || summary.direction === "sendrecv",
        true,
      );
      if (!adopted.accepted) continue;
      await this.migrateLocalScreenShareTrack();
      this.updateScreenShareTransceiverDirection();
      return true;
    }
    return false;
  }

  private adoptRemoteScreenTransceiver(
    transceiver?: ScreenShareTransceiverLike,
    track?: DirectedCallMediaStreamTrack,
    receiveRemote = true,
    allowOfferMid = false,
  ): { accepted: boolean; associationStrategy: "strict_identity" | "owned_transceiver" | "event_transceiver" | "offer_mid" | "receiver_track_identity" } {
    if (this.isRetiredScreenTransceiver(transceiver)) return { accepted: false, associationStrategy: "strict_identity" };
    if (!transceiver && !this.screenShareTransceiver) return { accepted: false, associationStrategy: "owned_transceiver" };
    if (transceiver && this.screenShareTransceiver && this.screenShareTransceiver !== transceiver) {
      const sameMid = Boolean(this.screenShareTransceiver?.mid && transceiver.mid && this.screenShareTransceiver.mid === transceiver.mid);
      const receiverTrackMatches = Boolean(track && transceiver.receiver?.track === track);
      if (!sameMid && !receiverTrackMatches && !allowOfferMid) return { accepted: false, associationStrategy: "strict_identity" };
      const associationStrategy = allowOfferMid || sameMid ? "offer_mid" : "receiver_track_identity";
      if (!this.rebindScreenShareTransceiver(transceiver, associationStrategy)) {
        return { accepted: false, associationStrategy };
      }
      this.remoteScreenShareReceptionEnabled = receiveRemote;
      this.updateScreenShareTransceiverDirection();
      return { accepted: true, associationStrategy };
    }
    if (transceiver) {
      this.ensureScreenShareTransceiver(transceiver);
    }
    this.remoteScreenShareReceptionEnabled = receiveRemote;
    this.updateScreenShareTransceiverDirection();
    return { accepted: true, associationStrategy: transceiver ? "event_transceiver" : "owned_transceiver" };
  }

  private emitRemoteScreenShareChanged(stream: DirectedCallMediaStream | null): void {
    this.onRemoteScreenShareChange?.(stream);
    this.remoteScreenShareChangedHandler?.(stream);
  }

  private emitDiagnostic(
    event: "peer_connection" | "remote_video_ontrack" | "remote_screen_stream_created" | "remote_screen_stream_updated" | "remote_screen_stream_cleared",
    details: DirectedCallWebRtcDiagnosticDetails,
  ): void {
    if (!isCallDebugEnabled()) return;
    try {
      this.onDiagnostic?.(event, details);
    } catch {
      // Diagnostic sinks are best-effort and must never affect call control flow.
    }
  }

  private videoTransceiverIndex(transceiver: ScreenShareTransceiverLike): number {
    const object = transceiver as unknown as object;
    const existing = this.videoTransceiverIndices.get(object);
    if (existing !== undefined) return existing;
    const index = this.nextVideoTransceiverIndex++;
    this.videoTransceiverIndices.set(object, index);
    return index;
  }

  private isVideoTransceiver(transceiver: ScreenShareTransceiverLike): boolean {
    return transceiver.kind === "video"
      || transceiver.sender?.track?.kind === "video"
      || transceiver.receiver?.track?.kind === "video"
      || transceiver === this.screenShareTransceiver;
  }

  private emitVideoTransceiverDiagnostics(stage: DirectedCallWebRtcDiagnosticStage, reason: DirectedCallWebRtcDiagnosticReason, sdp?: string): void {
    if (!isCallDebugEnabled()) return;
    let transceivers: ScreenShareTransceiverLike[] = [];
    try {
      transceivers = this.peerConnection?.getTransceivers?.()?.filter((transceiver) => this.isVideoTransceiver(transceiver)).slice(0, MAX_VIDEO_DIAGNOSTIC_ITEMS) ?? [];
    } catch {
      this.emitDiagnostic("peer_connection", {
        diagnosticStage: "transceiver_snapshot",
        diagnosticReason: "diagnostic_read_failed",
      });
      return;
    }
    if (transceivers.length === 0) {
      this.emitDiagnostic("peer_connection", {
        diagnosticStage: "transceiver_snapshot",
        diagnosticReason: "diagnostic_read_failed",
        videoTransceiverCount: 0,
      });
    }
    transceivers.forEach((transceiver) => {
      try {
        this.emitDiagnostic("peer_connection", {
          diagnosticStage: stage,
          diagnosticReason: reason,
          transceiverMid: transceiver.mid ?? null,
          transceiverCurrentDirection: transceiver.currentDirection ?? null,
          transceiverDirection: transceiver.direction ?? null,
          senderTrackPresent: transceiver.sender?.track?.kind === "video",
          receiverTrackPresent: transceiver.receiver?.track?.kind === "video",
          videoTransceiverIndex: this.videoTransceiverIndex(transceiver),
          videoTransceiverCount: transceivers.length,
          selectedScreenTransceiver: transceiver === this.screenShareTransceiver,
          localScreenSenderTransceiver: Boolean(this.localScreenShareTrack && transceiver.sender?.track === this.localScreenShareTrack),
        });
      } catch {
        this.emitDiagnostic("peer_connection", {
          diagnosticStage: "transceiver_snapshot",
          diagnosticReason: "diagnostic_read_failed",
          videoTransceiverCount: transceivers.length,
        });
      }
    });
    if (sdp !== undefined) {
      const summaries = videoSdpSummaries(sdp);
      summaries.forEach((summary, index) => this.emitDiagnostic("peer_connection", {
        diagnosticStage: "sdp_summary",
        diagnosticReason: reason,
        videoMLineCount: summaries.length,
        videoMLineIndex: index,
        videoMLineMid: summary.mid,
        videoMLineDirection: summary.direction,
        videoMLineRejected: summary.rejected,
      }));
      if (summaries.length === 0) this.emitDiagnostic("peer_connection", {
        diagnosticStage: "sdp_summary",
        diagnosticReason: reason,
        videoMLineCount: 0,
      });
    }
  }

  private clearRemoteScreenShare(notify: boolean): void {
    const stream = this.remoteScreenShareStream;
    const track = this.remoteScreenShareTrack;
    if (track && this.remoteScreenShareTrackEndedListener) {
      track.removeEventListener?.("ended", this.remoteScreenShareTrackEndedListener);
      this.remoteScreenShareTrackEndedListener = null;
    }
    if (stream && track) stream.removeTrack?.(track);
    this.remoteScreenShareTrack = null;
    this.remoteScreenShareStream = null;
    const source = this.remoteScreenShareStreamSource;
    this.remoteScreenShareStreamSource = null;
    if (stream) this.emitDiagnostic("remote_screen_stream_cleared", {
      diagnosticStage: "stream_assigned",
      diagnosticReason: "succeeded",
      remoteStreamPresent: false,
      ...(source ? { remoteStreamSource: source } : {}),
    });
    if (notify && stream) this.emitRemoteScreenShareChanged(null);
  }

  private bindRemoteScreenTrack(track: DirectedCallMediaStreamTrack, epoch: number): void {
    this.emitDiagnostic("remote_video_ontrack", {
      diagnosticStage: "ended_listener",
      diagnosticReason: "started",
      remoteTrackKind: track.kind,
      remoteTrackReadyState: track.readyState,
    });
    if (!track.addEventListener) {
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "ended_listener",
        diagnosticReason: "listener_unavailable",
        remoteTrackKind: track.kind,
        remoteTrackReadyState: track.readyState,
      });
      return;
    }
    const listener = () => {
      if (!this.isCurrent(epoch) || this.remoteScreenShareTrack !== track) return;
      this.clearRemoteScreenShare(true);
    };
    this.remoteScreenShareTrackEndedListener = listener as EventListener;
    try {
      track.addEventListener("ended", this.remoteScreenShareTrackEndedListener);
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "ended_listener",
        diagnosticReason: "succeeded",
        remoteTrackKind: track.kind,
        remoteTrackReadyState: track.readyState,
      });
    } catch (error) {
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "ended_listener",
        diagnosticReason: "listener_binding_failed",
        remoteTrackKind: track.kind,
        remoteTrackReadyState: track.readyState,
      });
      throw error;
    }
  }

  private exposeRemoteScreenTrack(
    track: DirectedCallMediaStreamTrack,
    epoch: number,
    browserStream?: DirectedCallMediaStream,
  ): void {
    if (this.remoteScreenShareTrack === track) {
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "duplicate_suppressed",
        diagnosticReason: "duplicate_track",
        remoteTrackKind: track.kind,
        remoteTrackReadyState: track.readyState,
        remoteStreamPresent: Boolean(this.remoteScreenShareStream),
        browserStreamPresent: Boolean(browserStream),
      });
      return;
    }
    const previousStream = this.remoteScreenShareStream;
    const previousTrack = this.remoteScreenShareTrack;
    if (previousTrack && this.remoteScreenShareTrackEndedListener) {
      previousTrack.removeEventListener?.("ended", this.remoteScreenShareTrackEndedListener);
      this.remoteScreenShareTrackEndedListener = null;
    }
    if (previousStream && previousTrack && previousStream.removeTrack) previousStream.removeTrack(previousTrack);

    let stream = browserStream ?? previousStream;
    const streamSource = browserStream ? "browser-provided" : this.remoteScreenShareStreamSource;
    if (!stream || !previousStream?.removeTrack && stream === previousStream) {
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "stream_construction",
        diagnosticReason: "started",
        remoteTrackKind: track.kind,
        browserStreamPresent: Boolean(browserStream),
      });
      try {
        stream = this.dependencies.createRemoteStream?.() ?? null;
        this.emitDiagnostic("remote_video_ontrack", {
          diagnosticStage: "stream_construction",
          diagnosticReason: stream ? "succeeded" : "stream_unavailable",
          remoteTrackKind: track.kind,
          browserStreamPresent: Boolean(browserStream),
        });
      } catch (error) {
        this.emitDiagnostic("remote_video_ontrack", {
          diagnosticStage: "stream_construction",
          diagnosticReason: "stream_constructor_failed",
          remoteTrackKind: track.kind,
          browserStreamPresent: Boolean(browserStream),
        });
        throw error;
      }
    }
    if (!stream) return;
    let hasTrack = false;
    try {
      hasTrack = stream.getTracks().includes(track);
    } catch (error) {
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "track_addition",
        diagnosticReason: "stream_inspection_failed",
        remoteTrackKind: track.kind,
      });
      throw error;
    }
    if (!hasTrack) {
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "track_addition",
        diagnosticReason: "started",
        remoteTrackKind: track.kind,
      });
      if (!stream.addTrack) {
        this.emitDiagnostic("remote_video_ontrack", {
          diagnosticStage: "track_addition",
          diagnosticReason: "add_track_unavailable",
          remoteTrackKind: track.kind,
        });
      } else {
        try {
          stream.addTrack(track);
          this.emitDiagnostic("remote_video_ontrack", {
            diagnosticStage: "track_addition",
            diagnosticReason: "succeeded",
            remoteTrackKind: track.kind,
          });
        } catch (error) {
          this.emitDiagnostic("remote_video_ontrack", {
            diagnosticStage: "track_addition",
            diagnosticReason: "add_track_failed",
            remoteTrackKind: track.kind,
          });
          throw error;
        }
      }
    }
    this.remoteScreenShareStream = stream;
    this.remoteScreenShareTrack = track;
    this.remoteScreenShareStreamSource = streamSource ?? "adapter-created";
    this.bindRemoteScreenTrack(track, epoch);
    this.emitDiagnostic(previousStream ? "remote_screen_stream_updated" : "remote_screen_stream_created", {
      diagnosticStage: "stream_assigned",
      diagnosticReason: "succeeded",
      remoteTrackKind: track.kind,
      remoteStreamPresent: true,
      remoteStreamSource: this.remoteScreenShareStreamSource,
      ...this.transceiverDiagnosticDetails(),
    });
    this.emitDiagnostic("remote_video_ontrack", {
      diagnosticStage: "publication_callback",
      diagnosticReason: "started",
      remoteTrackKind: track.kind,
      remoteStreamPresent: true,
      remoteStreamSource: this.remoteScreenShareStreamSource,
    });
    try {
      this.emitRemoteScreenShareChanged(stream);
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "publication_callback",
        diagnosticReason: "succeeded",
        remoteTrackKind: track.kind,
        remoteStreamPresent: true,
        remoteStreamSource: this.remoteScreenShareStreamSource,
      });
    } catch (error) {
      this.emitDiagnostic("remote_video_ontrack", {
        diagnosticStage: "publication_callback",
        diagnosticReason: "publication_callback_failed",
        remoteTrackKind: track.kind,
        remoteStreamPresent: Boolean(this.remoteScreenShareStream),
        remoteStreamSource: this.remoteScreenShareStreamSource ?? undefined,
      });
      throw error;
    }
    this.emitDiagnostic("remote_video_ontrack", {
      diagnosticStage: "publication_reconciled",
      diagnosticReason: "succeeded",
      remoteTrackKind: track.kind,
      remoteStreamPresent: Boolean(this.remoteScreenShareStream),
      remoteStreamSource: this.remoteScreenShareStreamSource ?? undefined,
    });
  }

  private transceiverDiagnosticDetails(): DirectedCallWebRtcDiagnosticDetails {
    const transceiver = this.screenShareTransceiver;
    try {
      return {
        transceiverMid: transceiver?.mid ?? null,
        transceiverCurrentDirection: transceiver?.currentDirection ?? null,
        transceiverDirection: transceiver?.direction ?? null,
        senderTrackPresent: Boolean(transceiver?.sender?.track),
        receiverTrackPresent: Boolean(transceiver?.receiver?.track),
      };
    } catch {
      return {
        transceiverMid: null,
        transceiverCurrentDirection: null,
        transceiverDirection: null,
        senderTrackPresent: false,
        receiverTrackPresent: false,
      };
    }
  }

  private emitTransceiverDiagnostic(event: "peer_connection", localSdp?: string, remoteSdp?: string): void {
    this.emitDiagnostic(event, {
      ...this.transceiverDiagnosticDetails(),
      localVideoDirection: localSdp ? videoDirection(localSdp) : null,
      remoteVideoDirection: remoteSdp ? videoDirection(remoteSdp) : null,
    });
  }

  private async ensureAudioPeer(epoch: number): Promise<void> {
    this.assertCurrent(epoch);
    if (this.peerConnection && this.localStream) return;

    const existingCreation = this.peerCreation;
    if (existingCreation) {
      await existingCreation.promise;
      this.assertCurrent(epoch);
      return;
    }

    const creation = {
      epoch,
      promise: this.createAudioPeer(epoch),
    };
    this.peerCreation = creation;
    try {
      await creation.promise;
    } finally {
      if (this.peerCreation === creation) this.peerCreation = null;
    }
  }

  private async createAudioPeer(epoch: number): Promise<void> {
    this.assertCurrent(epoch);
    if (this.peerConnection && this.localStream) return;
    let acquiredStream: DirectedCallMediaStream | null = null;
    try {
      acquiredStream = await this.dependencies.getUserMedia(this.getAudioConstraints());
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
      this.bindReadinessTrack(track, epoch, "local");
    });
    let createdPeerConnection: PeerConnectionLike | null = null;
    try {
      const configuration = await resolveRtcConfiguration(this.rtcConfigurationSource);
      this.assertCurrent(epoch);
      createdPeerConnection = this.dependencies.createPeerConnection(configuration);
      if (!this.isCurrent(epoch)) {
        createdPeerConnection.close();
        createdPeerConnection = null;
        throw new DirectedCallWebRtcStaleError();
      }
      this.peerConnection = createdPeerConnection;
      this.assertCurrent(epoch);
      this.recomputeInitialMediaReadiness(epoch);
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
        if (!this.isCurrent(epoch)) return;
        if (this.peerConnection?.connectionState) this.onPeerConnectionState?.(this.peerConnection.connectionState);
        this.emitPeerConnectionDiagnostics();
        this.recomputeInitialMediaReadiness(epoch);
      };
      const onPeerStateChange = () => {
        if (this.isCurrent(epoch)) {
          this.emitPeerConnectionDiagnostics();
          this.recomputeInitialMediaReadiness(epoch);
        }
      };
      this.peerConnection.oniceconnectionstatechange = onPeerStateChange;
      this.peerConnection.onicegatheringstatechange = onPeerStateChange;
      this.peerConnection.onsignalingstatechange = onPeerStateChange;
      this.peerConnection.ontrack = (event) => {
        if (!this.isCurrent(epoch)) return;
        if (event.track.kind === "video") {
          const eventTransceiver = event.transceiver as unknown as ScreenShareTransceiverLike | undefined;
          let expectedTransceiver = this.screenShareTransceiver;
          let identityMatch = expectedTransceiver && eventTransceiver ? expectedTransceiver === eventTransceiver : null;
          const receiverTrackIdentity = eventTransceiver?.receiver?.track
            ? (eventTransceiver.receiver.track === event.track ? "match" : "mismatch")
            : "unavailable";
          this.emitDiagnostic("remote_video_ontrack", {
            diagnosticStage: "ontrack_received",
            diagnosticReason: event.track.readyState === "ended" ? "track_ended" : "started",
            remoteTrackKind: event.track.kind,
            remoteTrackReadyState: event.track.readyState,
            remoteTrackMuted: (event.track as DirectedCallMediaStreamTrack & { muted?: boolean }).muted,
            remoteStreamPresent: Boolean(this.remoteScreenShareStream),
            browserStreamPresent: Boolean(event.streams[0]),
            eventTransceiverPresent: Boolean(eventTransceiver),
            eventTransceiverMid: eventTransceiver?.mid ?? null,
            expectedScreenTransceiverMid: expectedTransceiver?.mid ?? null,
            transceiverIdentityMatch: identityMatch,
            receiverTrackIdentity,
            eventSenderTrackPresent: Boolean(eventTransceiver?.sender?.track),
            expectedSenderTrackPresent: Boolean(expectedTransceiver?.sender?.track),
            eventReceiverTrackPresent: Boolean(eventTransceiver?.receiver?.track),
            expectedReceiverTrackPresent: Boolean(expectedTransceiver?.receiver?.track),
            associationStrategy: eventTransceiver ? "strict_identity" : "owned_transceiver",
            senderTrackPresent: Boolean(expectedTransceiver?.sender?.track),
            receiverTrackPresent: Boolean(expectedTransceiver?.receiver?.track),
            ...this.transceiverDiagnosticDetails(),
          });
          if (event.track.readyState === "ended") return;
          if (this.screenShareTransceiver && !this.remoteScreenShareReceptionEnabled) {
            this.emitDiagnostic("remote_video_ontrack", {
              diagnosticStage: "association_rejected",
              diagnosticReason: "reception_disabled",
              remoteTrackKind: event.track.kind,
              remoteTrackReadyState: event.track.readyState,
              associationAccepted: false,
            });
            return;
          }
          const adoption = this.adoptRemoteScreenTransceiver(eventTransceiver, event.track);
          expectedTransceiver = this.screenShareTransceiver;
          identityMatch = expectedTransceiver && eventTransceiver ? expectedTransceiver === eventTransceiver : null;
          this.emitDiagnostic("remote_video_ontrack", {
            diagnosticStage: "association_checked",
            diagnosticReason: adoption.accepted ? "succeeded" : "failed",
            remoteTrackKind: event.track.kind,
            remoteTrackReadyState: event.track.readyState,
            eventTransceiverPresent: Boolean(eventTransceiver),
            eventTransceiverMid: eventTransceiver?.mid ?? null,
            expectedScreenTransceiverMid: expectedTransceiver?.mid ?? null,
            transceiverIdentityMatch: identityMatch,
            receiverTrackIdentity,
            eventSenderTrackPresent: Boolean(eventTransceiver?.sender?.track),
            expectedSenderTrackPresent: Boolean(expectedTransceiver?.sender?.track),
            eventReceiverTrackPresent: Boolean(eventTransceiver?.receiver?.track),
            expectedReceiverTrackPresent: Boolean(expectedTransceiver?.receiver?.track),
            associationStrategy: adoption.associationStrategy,
            associationAccepted: adoption.accepted,
            senderTrackPresent: Boolean(expectedTransceiver?.sender?.track),
            receiverTrackPresent: Boolean(expectedTransceiver?.receiver?.track),
          });
          if (!adoption.accepted) {
            this.emitDiagnostic("remote_video_ontrack", {
              diagnosticStage: "association_rejected",
              diagnosticReason: identityMatch === false ? "transceiver_identity_mismatch" : "missing_transceiver",
              remoteTrackKind: event.track.kind,
              remoteTrackReadyState: event.track.readyState,
              eventTransceiverPresent: Boolean(eventTransceiver),
              eventTransceiverMid: eventTransceiver?.mid ?? null,
              expectedScreenTransceiverMid: expectedTransceiver?.mid ?? null,
              transceiverIdentityMatch: identityMatch,
              receiverTrackIdentity,
              eventSenderTrackPresent: Boolean(eventTransceiver?.sender?.track),
              expectedSenderTrackPresent: Boolean(expectedTransceiver?.sender?.track),
              eventReceiverTrackPresent: Boolean(eventTransceiver?.receiver?.track),
              expectedReceiverTrackPresent: Boolean(expectedTransceiver?.receiver?.track),
              associationStrategy: adoption.associationStrategy,
              associationAccepted: false,
            });
            return;
          }
          this.exposeRemoteScreenTrack(event.track, epoch, event.streams[0]);
          return;
        }
        if (event.track.kind !== "audio" || event.track.readyState === "ended") return;
        this.remoteAudioTrack = event.track;
        this.bindReadinessTrack(event.track, epoch, "remote");
        this.remoteStream = event.streams[0] ?? this.remoteStream ?? this.dependencies.createRemoteStream?.() ?? null;
        if (this.remoteStream && !this.remoteStream.getTracks().includes(event.track)) this.remoteStream.addTrack?.(event.track);
        if (this.remoteStream) {
          this.onRemoteStream?.(this.remoteStream);
          if (this.isCurrent(epoch) && this.remoteStream.getTracks().includes(event.track)) this.remoteAudioStreamBound = true;
        }
        this.recomputeInitialMediaReadiness(epoch);
      };
      for (const track of this.localStream.getTracks()) {
        this.assertCurrent(epoch);
        this.peerConnection.addTrack(track, this.localStream);
        this.recomputeInitialMediaReadiness(epoch);
      }
    } catch {
      if (this.localStream === acquiredStream) {
        acquiredStream?.getTracks().forEach((track) => track.stop());
        this.localStream = null;
      }
      if (this.peerConnection) {
        const peerConnection = this.peerConnection;
        peerConnection.onicecandidate = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onicegatheringstatechange = null;
        peerConnection.onsignalingstatechange = null;
        peerConnection.ontrack = null;
        peerConnection.close();
        if (createdPeerConnection === peerConnection) createdPeerConnection = null;
        if (this.peerConnection === peerConnection) this.peerConnection = null;
      }
      if (createdPeerConnection) {
        createdPeerConnection.close();
        createdPeerConnection = null;
      }
      this.recomputeInitialMediaReadiness(epoch);
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

  private bindReadinessTrack(track: DirectedCallMediaStreamTrack, epoch: number, scope: "local" | "remote"): void {
    if (this.readinessTrackCleanups.has(track) || !track.addEventListener) return;
    const listener = () => {
      if (this.isCurrent(epoch)) this.recomputeInitialMediaReadiness(epoch);
    };
    track.addEventListener("ended", listener);
    this.readinessTrackCleanups.set(track, () => track.removeEventListener?.("ended", listener));
    if (scope === "local") this.localReadinessTracks.add(track);
  }

  private clearLocalReadinessTrackListeners(): void {
    this.localReadinessTracks.forEach((track) => {
      this.readinessTrackCleanups.get(track)?.();
      this.readinessTrackCleanups.delete(track);
    });
    this.localReadinessTracks.clear();
  }

  private clearReadinessTrackListeners(): void {
    this.readinessTrackCleanups.forEach((cleanup) => cleanup());
    this.readinessTrackCleanups.clear();
    this.localReadinessTracks.clear();
  }

  private recomputeInitialMediaReadiness(epoch: number): void {
    if (!this.isCurrent(epoch)) return;
    const peer = this.peerConnection;
    const connectionState = peer?.connectionState;
    const transportConnected = connectionState === "connected"
      || (connectionState === undefined && (peer?.iceConnectionState === "connected" || peer?.iceConnectionState === "completed"));
    const localAudioSenderReady = Boolean(peer?.getSenders?.().some((sender) =>
      sender.track
      && (sender.track.kind === undefined || sender.track.kind === "audio")
      && sender.track.readyState !== "ended",
    ));
    const remoteAudioTrackReady = Boolean(
      this.remoteAudioTrack
      && this.remoteAudioTrack.readyState !== "ended"
      && this.remoteAudioTrack.kind === "audio",
    );
    this.emitInitialMediaReadiness(initialMediaReadiness({
      transportConnected,
      localAudioSenderReady,
      remoteAudioTrackReady,
      remoteAudioStreamBound: this.remoteAudioStreamBound,
    }));
  }

  private emitInitialMediaReadiness(next: DirectedCallInitialMediaReadiness): void {
    const previous = this.initialMediaReadiness;
    if (previous.transportConnected === next.transportConnected
      && previous.localAudioSenderReady === next.localAudioSenderReady
      && previous.remoteAudioTrackReady === next.remoteAudioTrackReady
      && previous.remoteAudioStreamBound === next.remoteAudioStreamBound
      && previous.ready === next.ready) return;
    this.initialMediaReadiness = next;
    this.onInitialMediaReadinessChange?.(next);
  }

  private emitPeerConnectionDiagnostics(): void {
    const peer = this.peerConnection;
    if (!peer) return;
    this.onPeerConnectionDiagnostics?.({
      connectionState: peer.connectionState ?? "unknown",
      iceConnectionState: peer.iceConnectionState ?? "unknown",
      iceGatheringState: peer.iceGatheringState ?? "unknown",
      signalingState: peer.signalingState ?? "unknown",
    });
  }

  private assertCurrent(epoch: number): void {
    if (!this.isCurrent(epoch)) throw new DirectedCallWebRtcStaleError();
  }
}
