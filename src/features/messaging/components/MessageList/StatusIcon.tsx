import { cn } from "@/shared/utils/cn";
import { MessageStatus } from "@/shared/types";

interface StatusIconProps {
  status?: MessageStatus;
  className?: string;
}

export function StatusIcon({ status, className }: StatusIconProps) {
  if (status === "error") {
    return (
      <svg
        className={cn("h-[19px] w-[19px] shrink-0", className)}
        viewBox="0 0 19 19"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Error sending"
      >
        <path d="M9.5 4.5V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9.5 14.5H9.51" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (!status) {
    return (
      <svg
        className={cn("h-[19px] w-[19px] shrink-0 opacity-60", className)}
        viewBox="0 0 19 19"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Sending"
      >
        <path d="M4 9.5A5.5 5.5 0 1 0 9.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (status === "sent" || status === "delivered") {
    return (
      <svg
        className={cn("h-[19px] w-[19px] shrink-0", status === "sent" ? "opacity-55" : "opacity-80", className)}
        viewBox="0 0 19 19"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={status === "sent" ? "Sent" : "Delivered"}
      >
        <path d="M3 9.5L6.5 13L14.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg
      className={cn("h-[19px] w-[19px] shrink-0 opacity-95", className)}
      viewBox="0 0 19 19"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Read"
    >
      <path d="M1.5 9.5L5 13L12.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 12.5L9.5 15L17 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
