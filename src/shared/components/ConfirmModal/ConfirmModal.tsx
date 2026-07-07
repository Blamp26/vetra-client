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
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4" 
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div className="vt-modal-backdrop" />
      <div 
        className="vt-modal-panel relative flex w-full max-w-md flex-col gap-5 p-5" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <span className="vt-kicker">{isDanger ? "Destructive action" : "Confirm action"}</span>
          <h3 className="text-xl font-semibold tracking-tight">
            {title}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {message}
          </p>
        </div>
        
        <div className="flex justify-end gap-2">
          <button 
            type="button"
            className="vt-button" 
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button 
            type="button"
            className={cn(
              "vt-button",
              isDanger 
                ? "vt-button--danger" 
                : "vt-button--primary"
            )}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
