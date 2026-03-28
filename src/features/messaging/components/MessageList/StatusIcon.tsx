import { cn } from "@/shared/utils/cn";
import { MessageStatus } from "@/shared/types";

interface StatusIconProps {
  status?: MessageStatus;
}

export function StatusIcon({ status }: StatusIconProps) {
  if (status === "error") {
    return (
      <svg className="ml-1" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Error sending">
        <circle cx="7" cy="7" r="7" fill="currentColor" className="text-destructive" />
        <text x="7" y="11" textAnchor="middle" fontSize="9" fontWeight="700" fill="white" fontFamily="Inter, sans-serif">!</text>
      </svg>
    );
  }
  if (status === "sent" || status === "delivered") {
    return (
      <svg className={cn("ml-1", status === "sent" ? "opacity-40" : "opacity-70")} width="18" height="11" viewBox="-1 5 34 20" xmlns="http://www.w3.org/2000/svg" aria-label={status === "sent" ? "Sent" : "Delivered"}>
        <path fill="currentColor" d="M3 13 L8 18 L20 6 L23 9 L8 24 L0 16 Z" />
      </svg>
    );
  }
  return (
    <svg className="ml-1 opacity-90" width="18" height="11" viewBox="-1 5 34 20" xmlns="http://www.w3.org/2000/svg" aria-label="Read">
      <path fill="currentColor" d="M3 13 L8 18 L20 6 L23 9 L8 24 L0 16 Z" />
      <path fill="currentColor" d="M16 17 L17 18 L29 6 L32 9 L17 24 L13 20 Z" />
    </svg>
  );
}
