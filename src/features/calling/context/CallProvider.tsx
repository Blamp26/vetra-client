import { createContext, useCallback, useRef, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { CallAudioRenderer } from "@/features/calling/components/CallAudioRenderer/CallAudioRenderer";
import { useCall } from "@/features/calling/hooks/useCall";
import type { UseCallReturn } from "@/features/calling/hooks/useCall.types";

export const CallContext = createContext<UseCallReturn | null>(null);

interface CallProviderProps {
  currentUserId: number;
  children: ReactNode;
}

export function CallProvider({ currentUserId, children }: CallProviderProps) {
  const call = useCall(currentUserId);
  const selectedOutputDeviceId = useAppStore((s) => s.selectedOutputDeviceId);
  const setOutputDevice = useAppStore((s) => s.setOutputDevice);
  const lastOutputDeviceFallbackRef = useRef<string | null>(null);

  const handleOutputDeviceFallback = useCallback(
    (missingDeviceId?: string) => {
      setOutputDevice("default");
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
    [setOutputDevice],
  );

  return (
    <CallContext.Provider value={call}>
      <CallAudioRenderer
        remoteStream={call.remoteStream}
        selectedOutputDeviceId={selectedOutputDeviceId}
        onOutputDeviceFallback={handleOutputDeviceFallback}
      />
      {children}
    </CallContext.Provider>
  );
}
