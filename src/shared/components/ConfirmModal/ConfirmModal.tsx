import { cn } from '@/shared/utils/cn';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isDanger?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  isLoading = false,
  isDanger = true,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div 
        className="bg-white border border-[#E1E1E1] rounded-lg shadow-xl w-[400px] p-6" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h3 className="m-0 text-[1.1rem] font-semibold text-[#0A0A0A]">{title}</h3>
        </div>
        
        <div className="mb-6">
          <p className="text-[#4A4A4A] leading-[1.5]">{message}</p>
        </div>
        
        <div className="flex gap-3 justify-end">
          <button 
            className="px-4 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#4A4A4A] cursor-pointer hover:bg-[#F8F8F8] disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button 
            className={cn(
              "px-4 py-2 text-white border-none rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              isDanger ? "bg-[#E74C3C] hover:bg-[#c0392b]" : "bg-[#5865F2] hover:bg-[#4752C4]"
            )}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Загрузка...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
