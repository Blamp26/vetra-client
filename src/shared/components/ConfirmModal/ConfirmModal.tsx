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
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm sm:p-6" 
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div 
        className="flex flex-col w-full max-w-md gap-6 p-6 bg-card border border-border rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <h3 id="confirm-modal-title" className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p id="confirm-modal-desc" className="text-sm text-muted-foreground leading-relaxed">
            {message}
          </p>
        </div>
        
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button 
            type="button"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors border border-border rounded-lg bg-background text-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" 
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button 
            type="button"
            className={cn(
              "inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
              isDanger 
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive shadow-sm" 
                : "bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary shadow-sm"
            )}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Загрузка...
              </span>
            ) : (
                confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
