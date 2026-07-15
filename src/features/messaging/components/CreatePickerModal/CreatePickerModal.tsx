import { useId, useRef } from "react";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { X } from "lucide-react";

interface Props {
  onPickServer: () => void;
  onPickGroup: () => void;
  onClose: () => void;
}

export function CreatePickerModal({ onPickServer, onPickGroup, onClose }: Props) {
  const titleId = useId();
  const serverButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={serverButtonRef}
      className="w-full max-w-sm flex flex-col"
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 id={titleId} className="text-lg font-normal">Create</h3>
        <IconButton label="Close create menu" size="compact" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="p-3 grid gap-1">
        <button
          ref={serverButtonRef}
          type="button"
          className="w-full rounded-md p-3 text-left hover:bg-accent"
          onClick={onPickServer}
        >
          <div className="text-sm font-normal">Create server</div>
          <div className="text-xs text-muted-foreground">Community space with channels.</div>
        </button>

        <button
          type="button"
          className="w-full rounded-md p-3 text-left hover:bg-accent"
          onClick={onPickGroup}
        >
          <div className="text-sm font-normal">Create group</div>
          <div className="text-xs text-muted-foreground">Direct conversation cluster.</div>
        </button>
      </div>
    </Dialog>
  );
}
