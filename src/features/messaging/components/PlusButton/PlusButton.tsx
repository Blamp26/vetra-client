interface Props {
  onClick: () => void;
  title?: string;
}

export function PlusButton({ onClick, title = "Add a Server or Group" }: Props) {
  return (
    <button
      type="button"
      className="w-11 h-11 rounded-full border-none cursor-pointer bg-[#43b581]/15 text-[#43b581] flex items-center justify-center text-[22px] font-light transition-all duration-200 hover:rounded-[14px] hover:bg-[#43b581] hover:text-white"
      onClick={onClick}
      aria-label="Create server or group"
      title={title}
    >
      +
    </button>
  );
}

