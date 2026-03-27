interface Props {
  onPickServer: () => void;
  onPickGroup: () => void;
  onClose: () => void;
}

export function CreatePickerModal({ onPickServer, onPickGroup, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-[420px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="m-0 text-[1.1rem] font-bold text-foreground">Create</h3>
          <button className="bg-transparent border-none text-[1.5rem] cursor-pointer text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="p-6">
          <div className="grid gap-3">
            <button
              className="m-0 text-left p-3.5 rounded-lg border border-border bg-muted/50 cursor-pointer transition-colors duration-150 hover:bg-muted"
              onClick={onPickServer}
            >
              <div className="font-bold mb-1 text-foreground">Create server</div>
              <div className="text-[0.85rem] text-muted-foreground">
                A community space with channels.
              </div>
            </button>

            <button
              className="m-0 text-left p-3.5 rounded-lg border border-border bg-muted/50 cursor-pointer transition-colors duration-150 hover:bg-muted"
              onClick={onPickGroup}
            >
              <div className="font-bold mb-1 text-foreground">Create group</div>
              <div className="text-[0.85rem] text-muted-foreground">
                A direct conversation cluster.
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

