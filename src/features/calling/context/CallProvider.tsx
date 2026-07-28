import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { mediaSettingsStore, useMediaSettings } from "@/shared/utils/mediaSettings";
import { CallAudioRenderer } from "@/features/calling/components/CallAudioRenderer/CallAudioRenderer";
import { useCall } from "@/features/calling/hooks/useCall";
import type { UseCallReturn } from "@/features/calling/hooks/useCall.types";
import { serializeResourceRef } from "@/shared/utils/resourceRef";
import { CallSoundController, type CallSoundProjection } from "../services/callSoundController";

export type LegacyCallContextValue = UseCallReturn & { callSound: CallSoundProjection };
export const CallContext = createContext<LegacyCallContextValue | null>(null);

interface CallProviderProps {
  currentUserId: number;
  children: ReactNode;
}

export function CallProvider({ currentUserId, children }: CallProviderProps) {
  const call = useCall(currentUserId);
  const { preferences } = useMediaSettings();
  const selectedOutputDeviceId = preferences.outputDeviceId;
  const outputVolume = useAppStore((s) => s.outputVolume);
  const soundEnabled = useAppStore((s) => s.soundEnabled);
  const callUserVolumes = useAppStore((s) => s.callUserVolumes);
  const mutedCallUserIds = useAppStore((s) => s.mutedCallUserIds);
  const lastOutputDeviceFallbackRef = useRef<string | null>(null);
  const soundControllerRef = useRef<CallSoundController | null>(null);
  const outputVolumeRef = useRef(outputVolume);
  const soundEnabledRef = useRef(soundEnabled);
  const deafenedRef = useRef(call.deafened);
  outputVolumeRef.current = outputVolume;
  soundEnabledRef.current = soundEnabled;
  deafenedRef.current = call.deafened;
  const [callSound, setCallSound] = useState<CallSoundProjection>({ autoplayBlocked: false, enableCallSounds: async () => false });

  const handleOutputDeviceFallback = useCallback(
    (missingDeviceId?: string) => {
      mediaSettingsStore.setOutputDeviceId("default");
      if (typeof window === "undefined") return;
      if (
        missingDeviceId &&
        lastOutputDeviceFallbackRef.current === missingDeviceId
      ) {
        return;
      }

      lastOutputDeviceFallbackRef.current = missingDeviceId ?? "unknown";
      window.dispatchEvent(
        new CustomEvent("vetra:toast", {
          detail: {
            title: "Audio output switched to default",
            body: "Your previous output device is unavailable, so call audio is using the system default device.",
            durationMs: 4000,
          },
        }),
      );
    },
    [],
  );

  useEffect(() => {
    const controller = new CallSoundController({
      scopeKey: `legacy:${currentUserId}`,
      getOutputDeviceId: () => mediaSettingsStore.getSnapshot().preferences.outputDeviceId,
      getOutputVolume: () => outputVolumeRef.current,
      isSoundEnabled: () => soundEnabledRef.current,
      isDeafened: () => Boolean(deafenedRef.current),
      setOutputDeviceId: (deviceId) => mediaSettingsStore.setOutputDeviceId(deviceId),
      onOutputDeviceFallback: handleOutputDeviceFallback,
      onDiagnostic: (event, details) => console.warn(`[CallProvider] ${event}`, details),
    });
    soundControllerRef.current = controller;
    const unsubscribe = controller.subscribe(setCallSound);
    if (call.callSoundEvent) controller.handle(call.callSoundEvent);
    return () => {
      unsubscribe();
      controller.handle({ type: "disposed" });
      if (soundControllerRef.current === controller) soundControllerRef.current = null;
    };
  }, [currentUserId, handleOutputDeviceFallback]);

  useEffect(() => {
    const controller = soundControllerRef.current;
    if (!controller) return;
    if (call.callSoundEvent) controller.handle(call.callSoundEvent);
    controller.setProjection({
      soundEnabled,
      deafened: call.deafened,
      outputVolume,
      outputDeviceId: preferences.outputDeviceId,
    });
  }, [call.callSoundEvent, call.deafened, outputVolume, preferences.outputDeviceId, soundEnabled]);

  return (
    <CallContext.Provider value={{ ...call, callSound }}>
      <CallAudioRenderer
        remoteStream={call.remoteStream}
        selectedOutputDeviceId={selectedOutputDeviceId}
        deafened={call.deafened ?? false}
        outputVolume={outputVolume}
        callUserVolume={call.remoteUserId == null ? 100 : (callUserVolumes ?? {})[serializeResourceRef(call.remoteUserId)] ?? 100}
        callUserMuted={call.remoteUserId != null && Boolean((mutedCallUserIds ?? {})[serializeResourceRef(call.remoteUserId)])}
        onOutputDeviceFallback={handleOutputDeviceFallback}
      />
      {children}
    </CallContext.Provider>
  );
}
