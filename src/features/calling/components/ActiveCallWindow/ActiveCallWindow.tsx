import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';

interface ActiveCallWindowProps {
  remoteStream: MediaStream | null;
  remoteUsername: string;
  isMuted: boolean;
  onMuteToggle: () => void;
  onHangUp: () => void;
}

export const ActiveCallWindow = ({
  remoteStream,
  remoteUsername,
  isMuted,
  onMuteToggle,
  onHangUp,
}: ActiveCallWindowProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (total: number) => {
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[4px] z-[9999]">
      <div className="flex flex-col items-center gap-3 p-8 px-10 rounded-2xl bg-[#1e1f22] shadow-[0_8px_32px_rgba(0,0,0,0.5)] min-w-[260px] animate-in fade-in slide-in-from-top-4 duration-200">
        <div className="relative w-[72px] h-[72px] rounded-full bg-[#5865f2] flex items-center justify-center">
          <span className="text-[28px] font-bold text-white select-none">
            {remoteUsername.charAt(0).toUpperCase()}
          </span>
          <span className="absolute bottom-[3px] right-[3px] w-[14px] h-[14px] rounded-full bg-[#23a55a] border-2 border-[#1e1f22]" />
        </div>

        <p className="m-0 text-[18px] font-semibold text-[#f2f3f5]">{remoteUsername}</p>
        <p className="m-0 text-[14px] text-[#949ba4] [font-variant-numeric:tabular-nums] tracking-[0.04em]">{formatTime(seconds)}</p>

        <audio ref={audioRef} autoPlay hidden />

        <div className="flex gap-4 mt-2">
          <button
            className={cn(
              "w-[52px] h-[52px] rounded-full border-none cursor-pointer flex items-center justify-center bg-[#2b2d31] text-[#f2f3f5] transition-all duration-150 hover:bg-[#35373c] hover:scale-108 active:scale-95",
              isMuted && "bg-[#5865f2] text-white hover:bg-[#4752c4]"
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          >
            {isMuted ? (
              <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          <button
            className="w-[52px] h-[52px] rounded-full border-none cursor-pointer flex items-center justify-center bg-[#ed4245] text-white transition-all duration-150 hover:bg-[#c03537] hover:scale-108 active:scale-95"
            onClick={onHangUp}
            aria-label="Завершить звонок"
          >
            <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
