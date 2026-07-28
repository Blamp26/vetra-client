import { getState } from "@/store";
import {
  type AudioDeviceObserverScope,
  invalidateAudioDeviceRefreshes,
  type AudioDeviceRefreshResult,
} from "@/store/slices/audioSlice";

type MediaDeviceRefreshListener = (result: AudioDeviceRefreshResult) => void;

const listeners = new Set<MediaDeviceRefreshListener>();
let activeObserverCount = 0;
let currentCleanup: (() => void) | null = null;

function publish(result: AudioDeviceRefreshResult): void {
  if (!result.committed) return;
  listeners.forEach((listener) => listener(result));
}

export function subscribeMediaDeviceRefresh(listener: MediaDeviceRefreshListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startMediaDeviceObserver(): () => void {
  activeObserverCount += 1;
  if (activeObserverCount > 1) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeObserverCount = Math.max(0, activeObserverCount - 1);
      if (activeObserverCount === 0) currentCleanup?.();
    };
  }

  let stopped = false;
  let released = false;
  const observerScope: AudioDeviceObserverScope = Symbol("media-device-observer");
  const refresh = () => {
    void getState().refreshDevices({ source: "devicechange", observerScope }).then((result) => {
      if (!stopped) publish(result);
    });
  };

  const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  mediaDevices?.addEventListener?.("devicechange", refresh);
  void getState().refreshDevices({ source: "initial", observerScope }).then((result) => {
    if (!stopped) publish(result);
  });

  currentCleanup = () => {
    if (stopped) return;
    stopped = true;
    mediaDevices?.removeEventListener?.("devicechange", refresh);
    invalidateAudioDeviceRefreshes(observerScope);
    currentCleanup = null;
  };

  return () => {
    if (released) return;
    released = true;
    activeObserverCount = Math.max(0, activeObserverCount - 1);
    if (activeObserverCount === 0) currentCleanup?.();
  };
}
