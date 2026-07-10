import React from "react";

interface MessageTailProps {
  side: "left" | "right";
  testId: string;
}

const INCOMING_TAIL_PATH = "M3 17h6V0c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 003 17z";
const OUTGOING_TAIL_PATH = "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z";
const TAIL_FILTER_VALUES = "0 0 0 0 0.0621962482 0 0 0 0 0.138574144 0 0 0 0 0.185037364 0 0 0 0.15 0";

export function MessageTail({ side, testId }: MessageTailProps) {
  const filterId = `message-tail-filter-${React.useId().replace(/:/g, "")}`;
  const path = side === "left" ? INCOMING_TAIL_PATH : OUTGOING_TAIL_PATH;

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-[-1px] block box-border h-[18px] w-[9px] overflow-hidden m-0 border-0 p-0 rounded-none transform-none opacity-100 ${side === "left" ? "left-[-9px] right-auto" : "right-[-9px] left-auto"}`}
      fill="none"
      height="20"
      width="9"
      xmlns="http://www.w3.org/2000/svg"
      data-testid={testId}
    >
      <defs>
        <filter
          id={filterId}
          x="-50%"
          y="-14.7%"
          width="200%"
          height="141.2%"
          filterUnits="objectBoundingBox"
        >
          <feOffset dy="1" in="SourceAlpha" result="shadowOffsetOuter1" />
          <feGaussianBlur stdDeviation="1" in="shadowOffsetOuter1" result="shadowBlurOuter1" />
          <feColorMatrix values={TAIL_FILTER_VALUES} in="shadowBlurOuter1" />
        </filter>
      </defs>
      <g fill="none" fillRule="evenodd">
        <path d={path} fill="#000" filter={`url(#${filterId})`} />
        <path d={path} className="corner" fill="var(--message-surface-color)" />
      </g>
    </svg>
  );
}
