import incomingAsset from "@/assets/calling/call-incoming.ogg";
import outgoingAsset from "@/assets/calling/call-outgoing.ogg";
import connectedAsset from "@/assets/calling/call-connected.ogg";
import endedAsset from "@/assets/calling/call-ended.ogg";
import failedAsset from "@/assets/calling/call-failed.ogg";
import { mediaSettingsStore } from "@/shared/utils/mediaSettings";
import { isMissingOutputDeviceError, isOutputDeviceSecurityError } from "../utils/outputDeviceErrors";

export type CallSoundEvent =
  | { type: "ringing_started"; callKey: string; direction: "incoming" | "outgoing" }
  | { type: "ringing_stopped"; callKey: string }
  | { type: "connected"; callKey: string }
  | { type: "ended"; callKey: string; reason: "ended" | "declined" | "cancelled" | "no_answer" }
  | { type: "failed"; callKey: string; reason: "unavailable" | "undelivered" | "busy" | "connection_failed" | "transport" }
  | { type: "disposed"; callKey?: string };

export interface CallSoundProjection {
  autoplayBlocked: boolean;
  enableCallSounds: () => Promise<boolean>;
}

export function persistentCallSoundEvent(
  previous: { callId: string | null; state: string | null; participantRole: "initiator" | "recipient" | null } | null,
  next: { callId: string | null; canonicalState: string | null; participantRole: "initiator" | "recipient" | null },
): CallSoundEvent | null {
  if (!next.callId || !next.canonicalState || previous?.callId !== next.callId) {
    if (!next.callId || !next.canonicalState) return null;
  }
  if (previous?.callId === next.callId && previous.state === next.canonicalState) return null;
  const callKey = next.callId;
  if (next.canonicalState === "presented" && next.participantRole) {
    return { type: "ringing_started", callKey, direction: next.participantRole === "recipient" ? "incoming" : "outgoing" };
  }
  if (next.canonicalState === "accepted" || next.canonicalState === "connecting") return { type: "ringing_stopped", callKey };
  if (next.canonicalState === "active") return { type: "connected", callKey };
  if (["ended", "declined", "cancelled", "no_answer"].includes(next.canonicalState)) {
    return { type: "ended", callKey, reason: next.canonicalState as "ended" | "declined" | "cancelled" | "no_answer" };
  }
  if (["unavailable", "undelivered", "busy", "connection_failed"].includes(next.canonicalState)) {
    return { type: "failed", callKey, reason: next.canonicalState as "unavailable" | "undelivered" | "busy" | "connection_failed" };
  }
  return null;
}

export function legacyCallSoundEvent(callKey: string, reason: string): CallSoundEvent {
  if (reason === "reject_call") return { type: "ended", callKey, reason: "declined" };
  if (reason === "outgoing_call_timeout") return { type: "ended", callKey, reason: "no_answer" };
  if (reason === "local_hang_up") return { type: "ended", callKey, reason: "cancelled" };
  if (reason === "remote_hang_up") return { type: "ended", callKey, reason: "ended" };
  if (reason === "call_channel_closed") return { type: "failed", callKey, reason: "transport" };
  return { type: "failed", callKey, reason: "connection_failed" };
}

export interface CallSoundControllerOptions {
  scopeKey: string;
  eventTarget?: Pick<Document, "addEventListener" | "removeEventListener">;
  createAudio?: (src: string) => HTMLAudioElement;
  getOutputDeviceId?: () => string;
  getOutputVolume?: () => number;
  isSoundEnabled?: () => boolean;
  isDeafened?: () => boolean;
  setOutputDeviceId?: (deviceId: string) => void;
  onOutputDeviceFallback?: (missingDeviceId: string) => void;
  onDiagnostic?: (event: string, details?: Record<string, unknown>) => void;
}

type SoundName = "incoming" | "outgoing" | "connected" | "ended" | "failed";
type AudioWithSink = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
type SoundListener = (projection: CallSoundProjection) => void;

const ASSETS: Record<SoundName, string> = {
  incoming: incomingAsset,
  outgoing: outgoingAsset,
  connected: connectedAsset,
  ended: endedAsset,
  failed: failedAsset,
};

function defaultAudio(src: string): HTMLAudioElement {
  const audio = document.createElement("audio");
  audio.src = src;
  audio.preload = "auto";
  audio.setAttribute("aria-hidden", "true");
  return audio;
}

function isAutoplayError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "NotAllowedError";
}

export class CallSoundController {
  private readonly options: Required<Pick<CallSoundControllerOptions, "getOutputDeviceId" | "getOutputVolume" | "isSoundEnabled" | "isDeafened">>;
  private readonly eventTarget: Pick<Document, "addEventListener" | "removeEventListener"> | null;
  private readonly createAudio: (src: string) => HTMLAudioElement;
  private readonly sounds: Record<SoundName, HTMLAudioElement>;
  private readonly listeners = new Set<SoundListener>();
  private generation = 0;
  private activeCallKey: string | null = null;
  private lastEventKey: string | null = null;
  private consumed = new Set<string>();
  private currentRingtone: SoundName | null = null;
  private eligibleRingtone: { sound: SoundName; callKey: string; generation: number } | null = null;
  private pending: { sound: SoundName; callKey: string; generation: number } | null = null;
  private fallbackReportedDevice: string | null = null;
  private recoveryInstalled = false;
  private disposed = false;
  private autoplayBlocked = false;
  private playbackAttempt = 0;
  private ringtoneSuppressed = false;
  private suppressionActive = false;

  constructor(private readonly config: CallSoundControllerOptions) {
    this.options = {
      getOutputDeviceId: config.getOutputDeviceId ?? (() => mediaSettingsStore.getSnapshot().preferences.outputDeviceId),
      getOutputVolume: config.getOutputVolume ?? (() => 1),
      isSoundEnabled: config.isSoundEnabled ?? (() => true),
      isDeafened: config.isDeafened ?? (() => false),
    };
    this.eventTarget = config.eventTarget ?? (typeof document === "undefined" ? null : document);
    this.createAudio = config.createAudio ?? defaultAudio;
    this.sounds = Object.fromEntries(
      (Object.entries(ASSETS) as Array<[SoundName, string]>).map(([name, src]) => [name, this.createAudio(src)]),
    ) as Record<SoundName, HTMLAudioElement>;
    Object.values(this.sounds).forEach((audio) => {
      audio.preload = "auto";
      audio.volume = this.effectiveVolume();
    });
  }

  getSnapshot(): CallSoundProjection {
    return { autoplayBlocked: this.autoplayBlocked, enableCallSounds: () => this.enableCallSounds() };
  }

  subscribe(listener: SoundListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handle(event: CallSoundEvent): void {
    if (this.disposed) return;
    if (event.type === "disposed") {
      this.dispose();
      return;
    }
    if (this.activeCallKey !== event.callKey) this.replaceCall(event.callKey);
    const eventKey = `${this.config.scopeKey}|${event.callKey}|${event.type}|${"reason" in event ? event.reason : ""}|${"direction" in event ? event.direction : ""}`;
    if (event.type !== "ringing_stopped" && eventKey === this.lastEventKey) return;
    this.lastEventKey = eventKey;

    switch (event.type) {
      case "ringing_started":
        this.stopOneShots();
        this.startRingtone(event.direction === "incoming" ? "incoming" : "outgoing", event.callKey);
        break;
      case "ringing_stopped":
        this.stopRingtone();
        break;
      case "connected":
        this.stopRingtone();
        this.playOnce("connected", event.callKey, `connected:${event.callKey}`);
        break;
      case "ended":
        this.stopRingtone();
        this.playOnce("ended", event.callKey, `ended:${event.callKey}`, false);
        break;
      case "failed":
        this.stopRingtone();
        this.playOnce("failed", event.callKey, `failed:${event.callKey}`, false);
        break;
    }
  }

  setProjection(projection: { soundEnabled?: boolean; deafened?: boolean; outputVolume?: number; outputDeviceId?: string }): void {
    if (projection.soundEnabled === false || projection.deafened) this.suppressPlayback();
    const volume = projection.outputVolume ?? this.options.getOutputVolume();
    Object.values(this.sounds).forEach((audio) => { audio.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1)); });
    if (projection.outputDeviceId !== undefined) void this.routeAll(projection.outputDeviceId);
    if (projection.soundEnabled !== false && !projection.deafened) {
      this.suppressionActive = false;
      if (this.ringtoneSuppressed && this.eligibleRingtone && this.activeCallKey === this.eligibleRingtone.callKey) {
        this.currentRingtone = this.eligibleRingtone.sound;
        this.ringtoneSuppressed = false;
        void this.play(this.eligibleRingtone.sound, this.eligibleRingtone.callKey, this.eligibleRingtone.generation);
      }
    }
  }

  async enableCallSounds(): Promise<boolean> {
    if (!this.pending || this.disposed) return false;
    const pending = this.pending;
    const played = await this.play(pending.sound, pending.callKey, pending.generation);
    if (played) this.removeRecoveryListener();
    return played;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.removeRecoveryListener();
    this.pending = null;
    this.eligibleRingtone = null;
    this.stopAll();
    Object.values(this.sounds).forEach((audio) => {
      audio.src = "";
    });
    this.listeners.clear();
  }

  private replaceCall(callKey: string): void {
    this.generation += 1;
    this.activeCallKey = callKey;
    this.lastEventKey = null;
    this.consumed = new Set([...this.consumed].filter((key) => key.startsWith(`${this.config.scopeKey}|${callKey}|`)));
    this.pending = null;
    this.eligibleRingtone = null;
    this.autoplayBlocked = false;
    this.removeRecoveryListener();
    this.stopAll();
    this.emit();
  }

  private startRingtone(sound: SoundName, callKey: string): void {
    this.currentRingtone = sound;
    this.ringtoneSuppressed = false;
    this.suppressionActive = false;
    const generation = this.generation;
    this.eligibleRingtone = { sound, callKey, generation };
    const audio = this.sounds[sound];
    audio.loop = true;
    audio.currentTime = 0;
    if (!this.options.isSoundEnabled() || this.options.isDeafened()) {
      this.ringtoneSuppressed = true;
      this.suppressionActive = true;
    }
    void this.play(sound, callKey, generation);
  }

  private playOnce(sound: SoundName, callKey: string, key: string, recoverAutoplay = true): void {
    if (this.consumed.has(key)) return;
    this.consumed.add(key);
    this.sounds[sound].loop = false;
    this.sounds[sound].currentTime = 0;
    void this.play(sound, callKey, this.generation, recoverAutoplay);
  }

  private async play(sound: SoundName, callKey: string, generation: number, recoverAutoplay = true): Promise<boolean> {
    if (this.disposed || generation !== this.generation || callKey !== this.activeCallKey) return false;
    if (!this.options.isSoundEnabled() || this.options.isDeafened()) return false;
    const attempt = ++this.playbackAttempt;
    const audio = this.sounds[sound];
    this.pending = { sound, callKey, generation };
    audio.volume = this.effectiveVolume();
    const routed = await this.route(audio, this.options.getOutputDeviceId(), callKey, generation);
    if (!routed || !this.isCurrentAttempt(attempt, callKey, generation)) return false;
    try {
      await audio.play();
      if (!this.isCurrentAttempt(attempt, callKey, generation)) {
        this.pauseAudio(audio);
        return false;
      }
      this.pending = null;
      this.setAutoplayBlocked(false);
      return true;
    } catch (error) {
      if (!this.isCurrentAttempt(attempt, callKey, generation)) return false;
      if (isAutoplayError(error)) {
        this.pending = recoverAutoplay ? { sound, callKey, generation } : null;
        if (recoverAutoplay) {
          this.setAutoplayBlocked(true);
          this.installRecoveryListener();
        } else {
          this.removeRecoveryListener();
          this.setAutoplayBlocked(false);
        }
      } else {
        this.config.onDiagnostic?.("call_sound_play_failed", { sound, error: error instanceof Error ? error.name : "unknown" });
      }
      return false;
    }
  }

  private isCurrentAttempt(attempt: number, callKey: string, generation: number): boolean {
    return !this.disposed
      && attempt === this.playbackAttempt
      && generation === this.generation
      && callKey === this.activeCallKey;
  }

  private async routeAll(deviceId: string): Promise<void> {
    const generation = this.generation;
    await Promise.all(Object.entries(this.sounds).map(([sound, audio]) => this.route(audio, deviceId || "default", this.activeCallKey ?? "none", generation, sound as SoundName)));
  }

  private async route(audio: HTMLAudioElement, deviceId: string, callKey: string, generation: number, sound?: SoundName): Promise<boolean> {
    const setSinkId = (audio as AudioWithSink).setSinkId;
    if (typeof setSinkId !== "function") return true;
    const sinkId = deviceId?.trim() || "default";
    try {
      await setSinkId.call(audio, sinkId);
      return true;
    } catch (error) {
      if (!isMissingOutputDeviceError(error) || sinkId === "default") {
        if (!isOutputDeviceSecurityError(error)) this.config.onDiagnostic?.("call_sound_output_route_failed", { sound, sinkId, error: error instanceof Error ? error.name : "unknown" });
        return false;
      }
      try {
        await setSinkId.call(audio, "default");
        if (generation !== this.generation || callKey !== (this.activeCallKey ?? callKey)) return false;
        this.config.setOutputDeviceId?.("default");
        this.options.getOutputDeviceId = () => "default";
        if (this.fallbackReportedDevice !== sinkId) {
          this.fallbackReportedDevice = sinkId;
          this.config.onOutputDeviceFallback?.(sinkId);
        }
        return true;
      } catch (fallbackError) {
        if (!isOutputDeviceSecurityError(fallbackError)) this.config.onDiagnostic?.("call_sound_default_route_failed", { sound, error: fallbackError instanceof Error ? fallbackError.name : "unknown" });
        return false;
      }
    }
  }

  private effectiveVolume(): number {
    const volume = this.options.getOutputVolume();
    return Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
  }

  private stopRingtone(): void {
    const hasRingtoneWork = Boolean(
      this.currentRingtone
      || this.eligibleRingtone
      || this.pending && (this.pending.sound === "incoming" || this.pending.sound === "outgoing"),
    );
    if (hasRingtoneWork) this.playbackAttempt += 1;
    if (this.currentRingtone) {
      const audio = this.sounds[this.currentRingtone];
      this.pauseAudio(audio);
      audio.currentTime = 0;
    }
    this.currentRingtone = null;
    this.ringtoneSuppressed = false;
    this.suppressionActive = false;
    this.lastEventKey = null;
    this.eligibleRingtone = null;
    if (!this.pending || this.pending.sound === "incoming" || this.pending.sound === "outgoing") this.pending = null;
    this.removeRecoveryListener();
    this.setAutoplayBlocked(false);
  }

  private suppressPlayback(): void {
    if (this.suppressionActive) return;
    this.suppressionActive = true;
    this.playbackAttempt += 1;
    Object.values(this.sounds).forEach((audio) => { this.pauseAudio(audio); audio.currentTime = 0; });
    this.currentRingtone = null;
    this.ringtoneSuppressed = Boolean(this.eligibleRingtone);
    if (this.pending && this.pending.sound !== "incoming" && this.pending.sound !== "outgoing") this.pending = null;
    this.removeRecoveryListener();
    this.setAutoplayBlocked(false);
  }

  private stopOneShots(): void {
    for (const sound of ["connected", "ended", "failed"] as SoundName[]) {
      this.pauseAudio(this.sounds[sound]);
      this.sounds[sound].currentTime = 0;
    }
  }

  private stopAll(): void {
    this.playbackAttempt += 1;
    Object.values(this.sounds).forEach((audio) => { this.pauseAudio(audio); audio.currentTime = 0; });
    this.currentRingtone = null;
    this.eligibleRingtone = null;
    this.ringtoneSuppressed = false;
    this.suppressionActive = false;
  }

  private installRecoveryListener(): void {
    if (!this.eventTarget || this.recoveryInstalled) return;
    this.eventTarget.addEventListener("pointerdown", this.recoveryHandler);
    this.eventTarget.addEventListener("keydown", this.recoveryHandler);
    this.eventTarget.addEventListener("touchstart", this.recoveryHandler);
    this.recoveryInstalled = true;
  }

  private removeRecoveryListener(): void {
    if (!this.eventTarget || !this.recoveryInstalled) return;
    this.eventTarget.removeEventListener("pointerdown", this.recoveryHandler);
    this.eventTarget.removeEventListener("keydown", this.recoveryHandler);
    this.eventTarget.removeEventListener("touchstart", this.recoveryHandler);
    this.recoveryInstalled = false;
  }

  private readonly recoveryHandler = () => { void this.enableCallSounds(); };

  private pauseAudio(audio: HTMLAudioElement): void {
    if (audio.paused === false || typeof (audio as unknown as { paused?: boolean }).paused === "undefined") audio.pause();
  }

  private setAutoplayBlocked(blocked: boolean): void {
    if (this.autoplayBlocked === blocked) return;
    this.autoplayBlocked = blocked;
    this.emit();
  }

  private emit(): void { this.listeners.forEach((listener) => listener(this.getSnapshot())); }
}
