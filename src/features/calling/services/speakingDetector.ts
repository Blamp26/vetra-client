export type SpeakingRole = "local" | "remote";

export interface CallSpeakingProjection {
  localSpeaking: boolean;
  remoteSpeaking: boolean;
}

interface SpeakingDetectorTrack {
  kind?: string;
  enabled?: boolean;
  readyState?: string;
  muted?: boolean;
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
}

interface SpeakingDetectorStream {
  getTracks(): SpeakingDetectorTrack[];
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
}

interface SpeakingAnalyser {
  fftSize: number;
  connect?: (destination: unknown) => unknown;
  disconnect?: () => void;
  getByteTimeDomainData(data: Uint8Array): void;
}

interface SpeakingAudioContext {
  createMediaStreamSource(stream: unknown): { connect(destination: unknown): unknown; disconnect?: () => void };
  createAnalyser(): SpeakingAnalyser;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
}

type SpeakingAudioContextFactory = () => SpeakingAudioContext | null;
type SpeakingListener = (projection: CallSpeakingProjection) => void;

const SAMPLE_INTERVAL_MS = 33;
const PUBLISH_INTERVAL_MS = 66;
const ACTIVATION_DELAY_MS = 80;
const RELEASE_DELAY_MS = 180;
const EMA_ALPHA = 0.25;
const START_THRESHOLD = 0.045;
const RELEASE_THRESHOLD = 0.030;
const FFT_SIZE = 256;

function defaultAudioContextFactory(): SpeakingAudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() as unknown as SpeakingAudioContext : null;
}

function audioTrack(stream: SpeakingDetectorStream | null): SpeakingDetectorTrack | null {
  if (!stream || typeof stream.getTracks !== "function") return null;
  return stream?.getTracks().find((track) =>
    (track.kind === undefined || track.kind === "audio") && track.readyState !== "ended",
  ) ?? null;
}

function isTrackUnavailable(track: SpeakingDetectorTrack | null, locallyMuted: boolean): boolean {
  return locallyMuted || !track || track.readyState === "ended" || track.muted === true || track.enabled === false;
}

function rms(data: Uint8Array): number {
  let sum = 0;
  for (const sample of data) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / data.length);
}

interface Registration {
  role: SpeakingRole;
  stream: SpeakingDetectorStream;
  track: SpeakingDetectorTrack;
  analyser: SpeakingAnalyser;
  source: { connect(destination: unknown): unknown; disconnect?: () => void };
  data: Uint8Array;
  cleanups: Array<() => void>;
  smoothed: number;
  activeSince: number | null;
  inactiveSince: number | null;
  speaking: boolean;
}

/** One call-scoped detector shared by all speaking UI surfaces. */
export class SpeakingDetector {
  private readonly listeners = new Set<SpeakingListener>();
  private readonly createAudioContext: SpeakingAudioContextFactory;
  private context: SpeakingAudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private visibilityListener: (() => void) | null = null;
  private local: Registration | null = null;
  private remote: Registration | null = null;
  private localStreamWatcher: { stream: SpeakingDetectorStream; cleanup: () => void } | null = null;
  private remoteStreamWatcher: { stream: SpeakingDetectorStream; cleanup: () => void } | null = null;
  private localMuted = false;
  private hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  private lastPublishedAt = 0;
  private projection: CallSpeakingProjection = { localSpeaking: false, remoteSpeaking: false };

  constructor(options: { createAudioContext?: SpeakingAudioContextFactory; onChange?: SpeakingListener } = {}) {
    this.createAudioContext = options.createAudioContext ?? defaultAudioContextFactory;
    if (typeof document !== "undefined") {
      this.visibilityListener = () => {
        this.hidden = document.visibilityState === "hidden";
        if (this.hidden) {
          this.stopSampling();
          this.clearSpeaking(true);
        } else {
          this.startSampling();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityListener);
    }
    if (options.onChange) this.listeners.add(options.onChange);
  }

  subscribe(listener: SpeakingListener): () => void {
    this.listeners.add(listener);
    listener(this.projection);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): CallSpeakingProjection {
    return this.projection;
  }

  registerStream(role: SpeakingRole, stream: SpeakingDetectorStream | null): void {
    const track = audioTrack(stream);
    const existing = role === "local" ? this.local : this.remote;
    if (existing?.stream === stream && existing?.track === track) return;
    this.unregister(role);
    if (!stream || this.hidden) {
      this.clearRole(role, true);
      return;
    }
    if (!track) {
      this.watchStream(role, stream);
      this.clearRole(role, true);
      return;
    }
    const existingContext = this.context;
    const context = existingContext ?? this.createAudioContext();
    if (!context) {
      this.clearRole(role, true);
      return;
    }
    let analyser: SpeakingAnalyser | null = null;
    let source: { connect(destination: unknown): unknown; disconnect?: () => void } | null = null;
    try {
      analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      source?.disconnect?.();
      analyser?.disconnect?.();
      if (!existingContext) void context.close?.().catch(() => undefined);
      this.clearRole(role, true);
      return;
    }
    this.context = context;
    const registration: Registration = {
      role,
      stream,
      track,
      analyser,
      source,
      data: new Uint8Array(analyser.fftSize),
      cleanups: [],
      smoothed: 0,
      activeSince: null,
      inactiveSince: null,
      speaking: false,
    };
    this.setRegistration(role, registration);
    this.bindTrackLifecycle(registration);
    this.watchStream(role, stream);
    this.startSampling();
    void context.resume?.().catch(() => undefined);
  }

  registerTrack(role: SpeakingRole, track: SpeakingDetectorTrack | null): void {
    if (!track || typeof MediaStream === "undefined") {
      this.unregister(role);
      return;
    }
    const existing = role === "local" ? this.local : this.remote;
    if (existing?.track === track) return;
    try {
      this.registerStream(role, new MediaStream([track as MediaStreamTrack]));
    } catch {
      this.unregister(role);
    }
  }

  setLocalMuted(muted: boolean): void {
    this.localMuted = muted;
    if (muted) this.clearRole("local", true);
  }

  unregister(role: SpeakingRole): void {
    const registration = role === "local" ? this.local : this.remote;
    if (registration) {
      registration.cleanups.forEach((cleanup) => cleanup());
      registration.source.disconnect?.();
      registration.analyser.disconnect?.();
      this.setRegistration(role, null);
    }
    this.clearStreamWatcher(role);
    if (!registration) {
      this.clearRole(role, true);
      return;
    }
    this.clearRole(role, true);
    if (!this.local && !this.remote) this.stopSampling();
  }

  reset(): void {
    this.unregister("local");
    this.unregister("remote");
    this.clearSpeaking(true);
  }

  dispose(): void {
    this.reset();
    this.stopSampling();
    if (this.visibilityListener && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityListener);
    }
    this.visibilityListener = null;
    const context = this.context;
    this.context = null;
    void context?.close?.().catch(() => undefined);
    this.listeners.clear();
  }

  private setRegistration(role: SpeakingRole, registration: Registration | null): void {
    if (role === "local") this.local = registration;
    else this.remote = registration;
  }

  private bindTrackLifecycle(registration: Registration): void {
    const onEnded = () => this.clearRole(registration.role, true);
    const onMuted = () => this.clearRole(registration.role, true);
    const onUnmuted = () => this.sample(Date.now());
    if (!registration.track.addEventListener) return;
    registration.track.addEventListener("ended", onEnded as EventListener);
    registration.track.addEventListener("mute", onMuted as EventListener);
    registration.track.addEventListener("unmute", onUnmuted as EventListener);
    registration.cleanups.push(() => {
      registration.track.removeEventListener?.("ended", onEnded as EventListener);
      registration.track.removeEventListener?.("mute", onMuted as EventListener);
      registration.track.removeEventListener?.("unmute", onUnmuted as EventListener);
    });

  }

  private watchStream(role: SpeakingRole, stream: SpeakingDetectorStream): void {
    this.clearStreamWatcher(role);
    if (!stream.addEventListener) return;
    const watcher = { stream, cleanup: () => undefined };
    const onStreamChanged = () => {
      const current = role === "local" ? this.localStreamWatcher : this.remoteStreamWatcher;
      if (current !== watcher) return;
      this.registerStream(role, stream);
    };
    stream.addEventListener("addtrack", onStreamChanged as EventListener);
    stream.addEventListener("removetrack", onStreamChanged as EventListener);
    watcher.cleanup = () => {
      stream.removeEventListener?.("addtrack", onStreamChanged as EventListener);
      stream.removeEventListener?.("removetrack", onStreamChanged as EventListener);
    };
    if (role === "local") this.localStreamWatcher = watcher;
    else this.remoteStreamWatcher = watcher;
  }

  private clearStreamWatcher(role: SpeakingRole): void {
    const watcher = role === "local" ? this.localStreamWatcher : this.remoteStreamWatcher;
    watcher?.cleanup();
    if (role === "local") this.localStreamWatcher = null;
    else this.remoteStreamWatcher = null;
  }

  private startSampling(): void {
    if (this.hidden || this.timer || (!this.local && !this.remote)) return;
    this.timer = setInterval(() => this.sample(Date.now()), SAMPLE_INTERVAL_MS);
  }

  private stopSampling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private sample(now: number): void {
    if (this.hidden) return;
    this.sampleRegistration(this.local, now, this.localMuted);
    this.sampleRegistration(this.remote, now, false);
    this.publish(false, now);
  }

  private sampleRegistration(registration: Registration | null, now: number, locallyMuted: boolean): void {
    if (!registration) return;
    if (isTrackUnavailable(registration.track, locallyMuted)) {
      this.clearRole(registration.role, true);
      return;
    }
    registration.analyser.getByteTimeDomainData(registration.data);
    const level = rms(registration.data);
    registration.smoothed = registration.smoothed === 0
      ? level
      : registration.smoothed + EMA_ALPHA * (level - registration.smoothed);
    if (registration.smoothed >= START_THRESHOLD) {
      registration.inactiveSince = null;
      registration.activeSince ??= now;
      if (!registration.speaking && now - registration.activeSince >= ACTIVATION_DELAY_MS) {
        registration.speaking = true;
      }
    } else if (registration.smoothed < RELEASE_THRESHOLD) {
      registration.activeSince = null;
      registration.inactiveSince ??= now;
      if (registration.speaking && now - registration.inactiveSince >= RELEASE_DELAY_MS) {
        registration.speaking = false;
      }
    } else if (!registration.speaking) {
      registration.activeSince = null;
    }
  }

  private clearRole(role: SpeakingRole, forcePublish: boolean): void {
    const registration = role === "local" ? this.local : this.remote;
    if (registration) {
      registration.speaking = false;
      registration.activeSince = null;
      registration.inactiveSince = null;
      registration.smoothed = 0;
    }
    const next = {
      ...this.projection,
      ...(role === "local" ? { localSpeaking: false } : { remoteSpeaking: false }),
    };
    if (next.localSpeaking !== this.projection.localSpeaking || next.remoteSpeaking !== this.projection.remoteSpeaking) {
      this.projection = next;
      this.publish(forcePublish, Date.now());
    }
  }

  private clearSpeaking(forcePublish: boolean): void {
    for (const registration of [this.local, this.remote]) {
      if (!registration) continue;
      registration.speaking = false;
      registration.activeSince = null;
      registration.inactiveSince = null;
      registration.smoothed = 0;
    }
    if (!this.projection.localSpeaking && !this.projection.remoteSpeaking) return;
    this.projection = { localSpeaking: false, remoteSpeaking: false };
    this.publish(forcePublish, Date.now());
  }

  private publish(force: boolean, now: number): void {
    const next = {
      localSpeaking: !this.hidden && Boolean(this.local?.speaking) && !this.localMuted,
      remoteSpeaking: !this.hidden && Boolean(this.remote?.speaking),
    };
    if (next.localSpeaking === this.projection.localSpeaking && next.remoteSpeaking === this.projection.remoteSpeaking) return;
    if (!force && now - this.lastPublishedAt < PUBLISH_INTERVAL_MS) return;
    this.projection = next;
    this.lastPublishedAt = now;
    this.listeners.forEach((listener) => listener(this.projection));
  }
}

export const speakingDetectorConstants = {
  sampleIntervalMs: SAMPLE_INTERVAL_MS,
  publishIntervalMs: PUBLISH_INTERVAL_MS,
  activationDelayMs: ACTIVATION_DELAY_MS,
  releaseDelayMs: RELEASE_DELAY_MS,
  emaAlpha: EMA_ALPHA,
  startThreshold: START_THRESHOLD,
  releaseThreshold: RELEASE_THRESHOLD,
  fftSize: FFT_SIZE,
} as const;
