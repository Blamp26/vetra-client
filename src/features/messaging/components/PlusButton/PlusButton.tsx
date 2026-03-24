import styles from "./PlusButton.module.css";

interface Props {
  onClick: () => void;
  title?: string;
}

export function PlusButton({ onClick, title = "Add a Server or Group" }: Props) {
  return (
    <button
      type="button"
      className={styles.plusBtn}
      onClick={onClick}
      aria-label="Create server or group"
      title={title}
    >
      +
    </button>
  );
}

