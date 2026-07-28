import { createContext, useCallback, useRef, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { mediaSettingsStore, useMediaSettings } from "@/shared/utils/mediaSettings";
import { CallAudioRenderer } from "@/features/calling/components/CallAudioRenderer/CallAudioRenderer";
import { useCall } from "@/features/calling/hooks/useCall";
import type { UseCallReturn } from "@/features/calling/hooks/useCall.types";
import { serializeResourceRef } from "@/shared/utils/resourceRef";

export const CallContext = createContext<UseCallReturn | null>(null);

interface CallProviderProps {
  currentUserId: number;
  children: ReactNode;
}

export function CallProvider({ currentUserId, children }: CallProviderProps) {
  const call = useCall(currentUserId);
  const { preferences } = useMediaSettings();
  const selectedOutputDeviceId = preferences.outputDeviceId;
  const outputVolume = useAppStore((s) => s.outputVolume);
  const callUserVolumes = useAppStore((s) => s.callUserVolumes);
  const mutedCallUserIds = useAppStore((s) => s.mutedCallUserIds);
  const lastOutputDeviceFallbackRef = useRef<string | null>(null);

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

  return (
    <CallContext.Provider value={call}>
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
