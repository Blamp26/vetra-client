// src/features/calling/components/IncomingCallModal/IncomingCallModal.tsx

interface Props {
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ callerName, onAccept, onReject }: Props) {
  return (
    <div className="fixed inset-x-0 top-12 z-[1000] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true">
      <div className="pointer-events-auto bg-card border border-border p-4 flex items-center gap-4">
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary text-primary-foreground text-sm font-normal flex items-center justify-center border border-border">
            {callerName.charAt(0).toUpperCase()}
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-primary uppercase">Incoming Call</span>
            <span className="text-sm font-normal text-foreground">{callerName}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="w-10 h-10 border border-border cursor-pointer flex items-center justify-center bg-destructive text-destructive-foreground"
            onClick={onReject}
            title="Decline"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9
                   -.87.46-1.67 1.06-2.37 1.78-.18.18-.43.28-.68.28
                   -.26 0-.51-.1-.69-.28L.28 13.08A.964.964 0 0 1 0 12.39
                   c0-.26.1-.51.29-.69C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71
                   4.7c.19.18.29.43.29.69 0 .27-.1.52-.28.7l-2.82 2.82
                   c-.18.18-.43.28-.69.28-.25 0-.5-.1-.68-.28a11.1 11.1 0 0
                   0-2.37-1.78.999.999 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
                fill="currentColor"
              />
            </svg>
          </button>

          <button
            className="w-10 h-10 border border-border cursor-pointer flex items-center justify-center bg-green-500 text-white"
            onClick={onAccept}
            title="Accept"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24
                   1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1
                   -9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1
                   0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02L6.62 10.79z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
    );
}
