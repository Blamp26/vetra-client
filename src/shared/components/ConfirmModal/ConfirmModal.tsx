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
        className="bg-card border border-border rounded-lg shadow-xl w-[400px] p-6" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h3 className="m-0 text-lg font-semibold text-foreground">{title}</h3>
        </div>
        
        <div className="mb-6">
          <p className="text-muted-foreground leading-normal">{message}</p>
        </div>
        
        <div className="flex gap-3 justify-end">
          <button 
            className="px-4 py-2 bg-background border border-border rounded-lg text-muted-foreground cursor-pointer hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button 
            className={cn(
              "px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              isDanger 
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" 
                : "bg-primary text-primary-foreground hover:bg-primary/90"
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
