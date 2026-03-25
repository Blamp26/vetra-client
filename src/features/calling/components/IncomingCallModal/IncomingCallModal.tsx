// src/features/calling/components/IncomingCallModal/IncomingCallModal.tsx

interface Props {
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ callerName, onAccept, onReject }: Props) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-end p-5 pointer-events-none" role="dialog" aria-modal="true" aria-label="Входящий звонок">
      <div className="pointer-events-auto bg-[#F8F8F8] border border-[#E1E1E1] rounded-2xl p-6 px-7 w-[280px] flex flex-col items-center gap-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-6 duration-250 ease-out">
        <div className="w-[72px] h-[72px] rounded-full bg-[#5865F2] flex items-center justify-center animate-pulse mb-1">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] text-white text-[1.6rem] font-bold flex items-center justify-center">
            {callerName.charAt(0).toUpperCase()}
          </div>
        </div>

        <p className="text-[0.78rem] text-[#7A7A7A] uppercase tracking-[0.08em] font-semibold m-0">Входящий звонок</p>
        <p className="text-[1.05rem] font-bold text-[#0A0A0A] m-0 text-center break-words">{callerName}</p>

        <div className="flex gap-5 mt-2">
          <button
            className="w-[52px] h-[52px] rounded-full border-none cursor-pointer flex items-center justify-center bg-[#c62828] text-white transition-all duration-120 hover:brightness-115 hover:scale-108 active:scale-92"
            onClick={onReject}
            aria-label="Отклонить звонок"
            title="Отклонить"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
            className="w-[52px] h-[52px] rounded-full border-none cursor-pointer flex items-center justify-center bg-[#2e7d32] text-white transition-all duration-120 hover:brightness-115 hover:scale-108 active:scale-92"
            onClick={onAccept}
            aria-label="Принять звонок"
            title="Принять"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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

        <div className="flex justify-between w-full px-1 text-[0.7rem] text-[#7A7A7A]">
          <span>Отклонить</span>
          <span>Принять</span>
        </div>
      </div>
    </div>
  );
}
