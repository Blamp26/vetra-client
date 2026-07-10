import { cn } from "@/shared/utils/cn";

interface MessageTailProps {
  side: "left" | "right";
  color: string;
  testId: string;
}

const INCOMING_TAIL_PATH = "M3 17h6V0c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 003 17z";
const OUTGOING_TAIL_PATH = "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z";

export function MessageTail({ side, color, testId }: MessageTailProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bottom-[-1px] block h-[18px] w-[9px] overflow-hidden",
        side === "left" ? "left-[-9px]" : "right-[-9px]",
      )}
      fill="none"
      height="20"
      viewBox="0 0 9 20"
      width="9"
      xmlns="http://www.w3.org/2000/svg"
      data-testid={testId}
    >
      <path
        d={side === "left" ? INCOMING_TAIL_PATH : OUTGOING_TAIL_PATH}
        fill={color}
      />
    </svg>
  );
}
