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
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-background/50" 
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="flex flex-col w-full max-w-md gap-4 p-4 bg-card border border-border" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-normal">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {message}
          </p>
        </div>
        
        <div className="flex justify-end gap-2">
          <button 
            type="button"
            className="px-4 py-2 text-sm border border-border" 
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button 
            type="button"
            className={cn(
              "px-4 py-2 text-sm border border-border",
              isDanger 
                ? "bg-destructive text-destructive-foreground" 
                : "bg-primary text-primary-foreground"
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
