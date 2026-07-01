// src/features/calling/components/IncomingCallModal/IncomingCallModal.tsx
import { Phone, PhoneOff } from "lucide-react";

interface Props {
  callerName: string;
  isPending?: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ callerName, isPending = false, onAccept, onReject }: Props) {
  return (
    <div className="fixed inset-x-0 top-12 z-[1000] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true">
      <div className="pointer-events-auto min-w-[320px] max-w-[420px] bg-card border border-border p-4 shadow-sm">
        <div className="flex items-center gap-4">
        
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary text-primary-foreground text-sm font-normal flex items-center justify-center border border-border">
              {callerName.charAt(0).toUpperCase()}
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] text-primary uppercase">
                {isPending ? "Connecting..." : "Incoming call"}
              </span>
              <span className="text-base font-normal text-foreground">{callerName}</span>
              <span className="text-xs text-muted-foreground">
                {isPending ? "Joining the call..." : "Choose whether to answer or decline."}
              </span>
            </div>
          </div>

          <div className="ml-auto flex gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 border border-border px-3 text-sm bg-destructive text-destructive-foreground disabled:pointer-events-none disabled:opacity-60"
              onClick={onReject}
              title="Decline"
              disabled={isPending}
            >
              <PhoneOff className="h-4 w-4" />
              <span>Decline</span>
            </button>

            <button
              className="inline-flex h-10 items-center justify-center gap-2 border border-border px-3 text-sm bg-green-500 text-white disabled:pointer-events-none disabled:opacity-60"
              onClick={onAccept}
              title="Accept"
              disabled={isPending}
            >
              <Phone className="h-4 w-4" />
              <span>{isPending ? "Connecting..." : "Accept"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    );
}
