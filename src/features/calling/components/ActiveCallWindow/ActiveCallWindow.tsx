import { useEffect, useRef } from 'react';
import { cn } from '@/shared/utils/cn';
import { formatCallTime } from '@/utils/formatDate';

interface ActiveCallWindowProps {
  remoteStream: MediaStream | null;
  remoteUsername: string;
  seconds: number;
  isMuted: boolean;
  onMuteToggle: () => void;
  onHangUp: () => void;
}

export const ActiveCallWindow = ({
  remoteStream,
  remoteUsername,
  seconds,
  isMuted,
  onMuteToggle,
  onHangUp,
}: ActiveCallWindowProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/40 backdrop-blur-3xl z-modal animate-in fade-in duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
      <div className="flex flex-col items-center gap-6 p-10 px-12 rounded-[2.5rem] bg-card/60 backdrop-blur-2xl shadow-[0_48px_96px_-24px_rgba(0,0,0,0.4)] border border-white/10 dark:border-white/5 ring-1 ring-inset ring-white/10 min-w-[320px] animate-in zoom-in-[0.95] slide-in-from-bottom-8 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
        
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl animate-pulse" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-2xl ring-4 ring-background">
            <span className="text-[2.25rem] font-extrabold text-primary-foreground select-none tracking-tight">
              {remoteUsername.charAt(0).toUpperCase()}
            </span>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-online border-4 border-card animate-bounce shadow-lg" />
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="m-0 text-[1.5rem] font-extrabold text-foreground tracking-tight leading-tight">{remoteUsername}</p>
          <div className="flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <p className="m-0 text-[0.875rem] font-bold text-muted-foreground [font-variant-numeric:tabular-nums] tracking-[0.1em] uppercase">
              {formatCallTime(seconds)}
            </p>
          </div>
        </div>

        <audio ref={audioRef} autoPlay hidden />

        <div className="flex gap-6 mt-4">
          <button
            className={cn(
              "w-16 h-16 rounded-full border-none cursor-pointer flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 active:scale-95 shadow-lg relative group",
              isMuted 
                ? "bg-destructive text-destructive-foreground rotate-[135deg]" 
                : "bg-muted/40 text-foreground hover:bg-muted/60 ring-1 ring-inset ring-border/20"
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            <div className="absolute inset-0 rounded-full bg-current opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
            {isMuted ? (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          <button
            className="w-16 h-16 rounded-full border-none cursor-pointer flex items-center justify-center bg-destructive text-destructive-foreground transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 active:scale-95 shadow-[0_12px_24px_-8px_rgba(239,68,68,0.5)] ring-1 ring-inset ring-black/10 group"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
             <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
