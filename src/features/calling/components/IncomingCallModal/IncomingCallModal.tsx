// src/features/calling/components/IncomingCallModal/IncomingCallModal.tsx
import { useEffect, useId, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { Dialog } from "@/shared/components/Dialog";
import { CALL_UX_TEXT } from "../../utils/callUxText";

interface Props {
  callerName: string;
  isPending?: boolean;
  onAccept: () => void;
  onReject: () => void;
  presentationKey?: string;
  onPresented?: () => void;
}

export function IncomingCallModal({
  callerName,
  isPending = false,
  onAccept,
  onReject,
  presentationKey,
  onPresented,
}: Props) {
  const [hasResponded, setHasResponded] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const declineRef = useRef<HTMLButtonElement>(null);
  const presentedKeyRef = useRef<string | null>(null);
  const isResponding = isPending || hasResponded;

  useEffect(() => {
    if (!onPresented) return;
    const key = presentationKey ?? "default";
    if (presentedKeyRef.current === key) return;
    presentedKeyRef.current = key;
    onPresented();
  }, [onPresented, presentationKey]);

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
    <Dialog
      open
      onClose={() => undefined}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={declineRef}
      closeOnBackdrop={false}
      closeOnEscape={false}
      showBackdrop={false}
      overlayClassName="pointer-events-none items-start pt-14"
      className="pointer-events-auto min-w-[340px] max-w-[460px] px-5 py-4"
    >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-border bg-primary text-base font-semibold text-primary-foreground">
              {callerName.charAt(0).toUpperCase()}
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="vt-kicker text-primary">
                {isResponding ? CALL_UX_TEXT.connecting : CALL_UX_TEXT.incoming}
              </span>
              <span id={titleId} className="truncate text-base font-semibold text-foreground">{callerName}</span>
              <span id={descriptionId} className="text-xs leading-5 text-muted-foreground">
                {isResponding ? "Joining the call..." : "Choose whether to answer or decline."}
              </span>
            </div>
          </div>

          <div className="ml-auto flex gap-2">
            <Button
              ref={declineRef}
              variant="danger"
              className="min-h-11 px-3.5 disabled:pointer-events-none disabled:opacity-60"
              onClick={handleReject}
              title="Decline"
              aria-label="Decline call"
              disabled={isResponding}
            >
              <PhoneOff className="h-4 w-4" />
              <span>Decline</span>
            </Button>

            <Button
              variant="primary"
              className="min-h-11 px-3.5 disabled:pointer-events-none disabled:opacity-60"
              onClick={handleAccept}
              title="Accept"
              aria-label="Accept call"
              disabled={isResponding}
            >
              <Phone className="h-4 w-4" />
              <span>{isResponding ? CALL_UX_TEXT.connecting : "Accept"}</span>
            </Button>
          </div>
        </div>
    </Dialog>
  );
}
