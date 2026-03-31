interface Props {
  onPickServer: () => void;
  onPickGroup: () => void;
  onClose: () => void;
}

export function CreatePickerModal({ onPickServer, onPickGroup, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl shadow-2xl shadow-black/5 ring-1 ring-white/5 w-full max-w-[420px] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-300" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="m-0 text-[1.1rem] font-bold text-foreground">Create</h3>
          <button className="bg-transparent border-none text-[1.5rem] cursor-pointer text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="p-6">
          <div className="grid gap-3">
            <button
              className="m-0 text-left p-4 rounded-2xl border border-border/50 bg-muted/40 cursor-pointer transition-all duration-200 hover:bg-muted active:scale-[0.98] shadow-sm"
              onClick={onPickServer}
            >
              <div className="font-bold mb-1 text-foreground">Create server</div>
              <div className="text-[0.85rem] text-muted-foreground">
                A community space with channels.
              </div>
            </button>

            <button
              className="m-0 text-left p-4 rounded-2xl border border-border/50 bg-muted/40 cursor-pointer transition-all duration-200 hover:bg-muted active:scale-[0.98] shadow-sm"
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

