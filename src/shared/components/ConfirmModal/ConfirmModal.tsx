import { useId } from "react";
import { Button } from "@/shared/components/Button";
import { Dialog } from "@/shared/components/Dialog";

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
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Dialog
      open
      onClose={onCancel}
      labelledBy={titleId}
      describedBy={descriptionId}
    >
      <div className="flex w-full max-w-md flex-col gap-5 p-5">
        <div className="flex flex-col gap-2">
          <span className="vt-kicker">{isDanger ? "Destructive action" : "Confirm action"}</span>
          <h3 id={titleId} className="text-xl font-semibold tracking-tight">
            {title}
          </h3>
          <p id={descriptionId} className="text-sm leading-6 text-muted-foreground">
            {message}
          </p>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDanger ? "danger" : "primary"}
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
