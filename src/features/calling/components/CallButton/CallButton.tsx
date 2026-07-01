// src/features/calling/components/CallButton/CallButton.tsx

import type { CallStatus } from '../../hooks/useCall.types';
import type { ResourceRef } from '@/shared/types';
import { Phone } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { debugCall } from "../../utils/callDebug";

interface Props {
  targetUserId: ResourceRef | null | undefined;
  targetUsername: string;
  status: CallStatus;
  onCall: (targetUserId: ResourceRef, targetUsername?: string) => void;
  onUnavailable?: (reason: string) => void;
  className?: string;
}

function hasValidTarget(targetUserId: ResourceRef | null | undefined): targetUserId is ResourceRef {
  return targetUserId !== null && targetUserId !== undefined && String(targetUserId).trim().length > 0;
}

export function CallButton({ targetUserId, targetUsername, status, onCall, onUnavailable, className }: Props) {
  const isDisabled = status !== 'idle';
  const isMissingTarget = !hasValidTarget(targetUserId);

  const handleClick = () => {
    debugCall('[CallButton] clicked', {
      status,
      targetUserId,
      targetUsername,
      disabled: isDisabled,
      missingTarget: isMissingTarget,
    });

    if (isDisabled) {
      onUnavailable?.(`Call unavailable while ${status}.`);
      return;
    }

    if (isMissingTarget) {
      onUnavailable?.('Cannot start call because this user is missing call target information.');
      return;
    }

    onCall(targetUserId, targetUsername);
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] hover:bg-accent size-9 h-9 w-9 text-muted-foreground hover:text-foreground",
        className
      )}
      onClick={handleClick}
      disabled={isDisabled}
      title={
        isDisabled
          ? `Call unavailable while ${status}`
          : isMissingTarget
            ? `Call unavailable: missing user`
            : `Call ${targetUsername}`
      }
      aria-label={isMissingTarget ? `Call unavailable` : `Call ${targetUsername}`}
    >
      <Phone className="h-4 w-4" />
    </button>
  );
}
