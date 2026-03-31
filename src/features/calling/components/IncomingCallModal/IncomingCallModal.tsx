// src/features/calling/components/IncomingCallModal/IncomingCallModal.tsx

interface Props {
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ callerName, onAccept, onReject }: Props) {
  return (
    <div className="fixed inset-x-0 top-12 z-[1000] flex items-center justify-center p-5 pointer-events-none" role="dialog" aria-modal="true" aria-label="Incoming Call">
      <div className="pointer-events-auto bg-card/60 backdrop-blur-3xl border border-white/10 dark:border-white/5 rounded-[2.5rem] p-4 pl-6 pr-4 flex items-center gap-6 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] ring-1 ring-inset ring-white/10 animate-in fade-in slide-in-from-top-8 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
        
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 shrink-0">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping duration-[2000ms]" />
            <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-lg font-bold flex items-center justify-center shadow-lg ring-2 ring-background">
              {callerName.charAt(0).toUpperCase()}
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-[0.625rem] font-bold text-primary uppercase tracking-[0.14em]">Incoming Call</span>
            <span className="text-[1.05rem] font-extrabold text-foreground tracking-tight leading-tight">{callerName}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            className="w-12 h-12 rounded-full border-none cursor-pointer flex items-center justify-center bg-destructive/10 text-destructive transition-all duration-300 hover:bg-destructive hover:text-destructive-foreground hover:scale-110 active:scale-90 ring-1 ring-inset ring-destructive/20"
            onClick={onReject}
            aria-label="Decline Call"
            title="Decline"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
            className="w-12 h-12 rounded-full border-none cursor-pointer flex items-center justify-center bg-green-500/10 text-green-500 transition-all duration-300 hover:bg-green-500 hover:text-white hover:scale-110 active:scale-95 ring-1 ring-inset ring-green-500/20 shadow-[0_8px_16px_-4px_rgba(34,197,94,0.3)] shadow-green-500/20"
            onClick={onAccept}
            aria-label="Accept Call"
            title="Accept"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
