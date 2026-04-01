interface Props {
  onPickServer: () => void;
  onPickGroup: () => void;
  onClose: () => void;
}

export function CreatePickerModal({ onPickServer, onPickGroup, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-sm flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-normal">Create</h3>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>

        <div className="p-4 grid gap-2">
          <button
            className="p-4 text-left border border-border bg-background hover:bg-accent"
            onClick={onPickServer}
          >
            <div className="text-sm font-normal">Create server</div>
            <div className="text-xs text-muted-foreground">Community space with channels.</div>
          </button>

          <button
            className="p-4 text-left border border-border bg-background hover:bg-accent"
            onClick={onPickGroup}
          >
            <div className="text-sm font-normal">Create group</div>
            <div className="text-xs text-muted-foreground">Direct conversation cluster.</div>
          </button>
        </div>
      </div>
    </div>
  );
}
