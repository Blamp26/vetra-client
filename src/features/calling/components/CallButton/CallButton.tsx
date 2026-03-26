// src/features/calling/components/CallButton/CallButton.tsx

import type { CallStatus } from '../../hooks/useCall.types';
import { Phone } from "lucide-react";
import { cn } from "@/shared/utils/cn";

interface Props {
  targetUserId: number;
  targetUsername: string;
  status: CallStatus;
  onCall: (targetUserId: number) => void;
  className?: string;
}

export function CallButton({ targetUserId, targetUsername, status, onCall, className }: Props) {
  const isDisabled = status !== 'idle';

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] hover:bg-accent size-9 h-9 w-9 text-muted-foreground hover:text-foreground",
        className
      )}
      onClick={() => onCall(targetUserId)}
      disabled={isDisabled}
      title={isDisabled ? `Звонок недоступен (${status})` : `Позвонить ${targetUsername}`}
      aria-label={`Позвонить ${targetUsername}`}
    >
      <Phone className="h-4 w-4" />
    </button>
  );
}
