interface MessageTailProps {
  side: "left" | "right";
  testId: string;
}

const INCOMING_TAIL_PATH = "M3 17h6V0c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 003 17z";
const OUTGOING_TAIL_PATH = "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z";
export function MessageTail({ side, testId }: MessageTailProps) {
  const path = side === "left" ? INCOMING_TAIL_PATH : OUTGOING_TAIL_PATH;

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-[-1px] block box-border h-[18px] w-[6px] overflow-hidden m-0 border-0 p-0 rounded-none transform-none opacity-100 ${side === "left" ? "left-[-6px] right-auto" : "right-[-6px] left-auto"}`}
      fill="none"
      height="20"
      width="6"
      xmlns="http://www.w3.org/2000/svg"
      data-testid={testId}
    >
      <g fill="none" fillRule="evenodd">
        <path d={path} className="corner" fill="var(--message-surface-color)" />
      </g>
    </svg>
  );
}
