// src/features/calling/components/CallButton/CallButton.tsx

import type { CallStatus } from '../../hooks/useCall.types';

interface Props {
  targetUserId: number;
  targetUsername: string;
  status: CallStatus;
  onCall: (targetUserId: number) => void;
}

export function CallButton({ targetUserId, targetUsername, status, onCall }: Props) {
  const isDisabled = status !== 'idle';

  // DEBUG
  console.log('[CallButton] render | status:', status, '| disabled:', isDisabled);

  return (
    <button
      className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-full border-none bg-white text-[#4A4A4A] cursor-pointer transition-all duration-150 shrink-0 p-0 hover:bg-[#2e7d32] hover:text-white hover:scale-108 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed"
      onClick={() => onCall(targetUserId)}
      disabled={isDisabled}
      title={isDisabled ? `Звонок недоступен (${status})` : `Позвонить ${targetUsername}`}
      aria-label={`Позвонить ${targetUsername}`}
    >
      <svg
        className="w-[18px] h-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24
             1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1
             -9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1
             0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02L6.62 10.79z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
