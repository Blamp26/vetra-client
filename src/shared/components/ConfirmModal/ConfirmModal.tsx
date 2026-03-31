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
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
  isDanger = true,
}: ConfirmModalProps) {
  return (
    <div 
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-background/40 backdrop-blur-3xl sm:p-6 animate-in fade-in duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" 
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div 
        className="flex flex-col w-full max-w-md gap-8 p-8 bg-card/60 backdrop-blur-2xl border border-white/10 dark:border-white/5 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/10 animate-in zoom-in-[0.95] slide-in-from-bottom-8 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3">
          <h3 id="confirm-modal-title" className="text-[1.25rem] font-extrabold tracking-tight text-foreground leading-tight">
            {title}
          </h3>
          <p id="confirm-modal-desc" className="text-[0.875rem] font-medium text-muted-foreground/70 leading-relaxed">
            {message}
          </p>
        </div>
        
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button 
            type="button"
            className="inline-flex items-center justify-center px-6 py-3 text-[0.875rem] font-bold transition-all border border-white/10 rounded-2xl bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-50" 
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button 
            type="button"
            className={cn(
              "inline-flex items-center justify-center px-6 py-3 text-[0.875rem] font-bold transition-all active:scale-95 rounded-2xl shadow-lg ring-1 ring-inset ring-black/5 disabled:pointer-events-none disabled:opacity-50",
              isDanger 
                ? "bg-destructive text-white hover:bg-destructive/90 shadow-destructive/20" 
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
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
                Processing...
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
