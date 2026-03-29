interface Props {
  onClick: () => void;
  title?: string;
}

export function PlusButton({ onClick, title = "Add a Server or Group" }: Props) {
  return (
    <button
      type="button"
      className="w-11 h-11 rounded-full border-none cursor-pointer bg-emerald-500/15 text-emerald-500 flex items-center justify-center text-2xl font-light transition-all duration-200 hover:rounded-xl hover:bg-emerald-500 hover:text-white"
      onClick={onClick}
      aria-label="Create server or group"
      title={title}
    >
      +
    </button>
  );
}

