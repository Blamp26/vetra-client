// src/features/calling/components/CallButton/CallButton.tsx

import type { CallServiceStatus, CallStatus } from '../../hooks/useCall.types';
import type { ResourceRef } from '@/shared/types';
import { Phone } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { debugCall } from "../../utils/callDebug";
import { getCallServiceUnavailableMessage, getCallStatusLabel } from "../../utils/callUxText";

interface Props {
  targetUserId: ResourceRef | null | undefined;
  targetUsername: string;
  status: CallStatus;
  callServiceStatus?: CallServiceStatus;
  onCall: (targetUserId: ResourceRef, targetUsername?: string) => void;
  onUnavailable?: (reason: string) => void;
  className?: string;
}

function hasValidTarget(targetUserId: ResourceRef | null | undefined): targetUserId is ResourceRef {
  return targetUserId !== null && targetUserId !== undefined && String(targetUserId).trim().length > 0;
}

export function CallButton({ targetUserId, targetUsername, status, callServiceStatus, onCall, onUnavailable, className }: Props) {
  const serviceUnavailableReason = getCallServiceUnavailableMessage(callServiceStatus);
  const isDisabled = status !== 'idle' || Boolean(serviceUnavailableReason);
  const isMissingTarget = !hasValidTarget(targetUserId);
  const statusLabel = getCallStatusLabel({ status });

  const handleClick = () => {
    debugCall('[CallButton] clicked', {
      status,
      targetUserId,
      targetUsername,
      callServiceStatus,
      disabled: isDisabled,
      missingTarget: isMissingTarget,
    });

    if (serviceUnavailableReason) {
      onUnavailable?.(serviceUnavailableReason);
      return;
    }

    if (isDisabled) {
      onUnavailable?.(`Call unavailable while ${statusLabel}`);
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
        "inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-border/70 bg-card/80 text-sm font-medium text-muted-foreground transition-all outline-none hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
      onClick={handleClick}
      disabled={isDisabled}
      title={
        serviceUnavailableReason
          ? serviceUnavailableReason
          : isDisabled
          ? `Call unavailable while ${statusLabel}`
          : isMissingTarget
            ? `Call unavailable: missing user`
            : `Call ${targetUsername}`
      }
      aria-label={serviceUnavailableReason ?? (isMissingTarget ? `Call unavailable` : `Call ${targetUsername}`)}
    >
      <Phone className="h-4 w-4" />
    </button>
  );
}
