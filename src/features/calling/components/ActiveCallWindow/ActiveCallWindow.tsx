import { useEffect, useRef, useState } from 'react';
import styles from './ActiveCallWindow.module.css';

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
    <div className={styles.overlay}>
      <div className={styles.window}>
        <div className={styles.avatar}>
          <span className={styles.avatarInitial}>
            {remoteUsername.charAt(0).toUpperCase()}
          </span>
          <span className={styles.activeDot} />
        </div>

        <p className={styles.username}>{remoteUsername}</p>
        <p className={styles.timer}>{formatTime(seconds)}</p>

        <audio ref={audioRef} autoPlay hidden />

        <div className={styles.controls}>
          <button
            className={`${styles.controlBtn} ${isMuted ? styles.mutedBtn : ''}`}
            onClick={onMuteToggle}
            aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          >
            {isMuted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          <button
            className={`${styles.controlBtn} ${styles.hangUpBtn}`}
            onClick={onHangUp}
            aria-label="Завершить звонок"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
