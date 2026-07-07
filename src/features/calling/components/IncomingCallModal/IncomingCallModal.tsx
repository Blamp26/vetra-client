// src/features/calling/components/IncomingCallModal/IncomingCallModal.tsx
import { useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { CALL_UX_TEXT } from "../../utils/callUxText";

interface Props {
  callerName: string;
  isPending?: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ callerName, isPending = false, onAccept, onReject }: Props) {
  const [hasResponded, setHasResponded] = useState(false);
  const isResponding = isPending || hasResponded;

  const handleAccept = () => {
    if (isResponding) return;
    setHasResponded(true);
    onAccept();
  };

  const handleReject = () => {
    if (isResponding) return;
    setHasResponded(true);
    onReject();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="vt-modal-panel pointer-events-auto min-w-[340px] max-w-[460px] px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-border bg-primary text-base font-semibold text-primary-foreground">
              {callerName.charAt(0).toUpperCase()}
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="vt-kicker text-primary">
                {isResponding ? CALL_UX_TEXT.connecting : CALL_UX_TEXT.incoming}
              </span>
              <span className="truncate text-base font-semibold text-foreground">{callerName}</span>
              <span className="text-xs leading-5 text-muted-foreground">
                {isResponding ? "Joining the call..." : "Choose whether to answer or decline."}
              </span>
            </div>
          </div>

          <div className="ml-auto flex gap-2">
            <button
              className="vt-button vt-button--danger min-h-11 px-3.5 disabled:pointer-events-none disabled:opacity-60"
              onClick={handleReject}
              title="Decline"
              aria-label="Decline call"
              disabled={isResponding}
            >
              <PhoneOff className="h-4 w-4" />
              <span>Decline</span>
            </button>

            <button
              className="vt-button vt-button--primary min-h-11 px-3.5 disabled:pointer-events-none disabled:opacity-60"
              onClick={handleAccept}
              title="Accept"
              aria-label="Accept call"
              disabled={isResponding}
            >
              <Phone className="h-4 w-4" />
              <span>{isResponding ? CALL_UX_TEXT.connecting : "Accept"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    );
}
