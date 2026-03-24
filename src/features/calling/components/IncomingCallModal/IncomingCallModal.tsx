// src/features/calling/components/IncomingCallModal/IncomingCallModal.tsx

import styles from './IncomingCallModal.module.css';

interface Props {
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ callerName, onAccept, onReject }: Props) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Входящий звонок">
      <div className={styles.modal}>
        <div className={styles.avatarRing}>
          <div className={styles.avatar}>
            {callerName.charAt(0).toUpperCase()}
          </div>
        </div>

        <p className={styles.label}>Входящий звонок</p>
        <p className={styles.callerName}>{callerName}</p>

        <div className={styles.actions}>
          <button
            className={styles.rejectBtn}
            onClick={onReject}
            aria-label="Отклонить звонок"
            title="Отклонить"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
            className={styles.acceptBtn}
            onClick={onAccept}
            aria-label="Принять звонок"
            title="Принять"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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

        <div className={styles.hints}>
          <span>Отклонить</span>
          <span>Принять</span>
        </div>
      </div>
    </div>
  );
}
