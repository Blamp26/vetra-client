import { useAppStore, type RootState } from "@/store";
import { X, Search, Send, User, Hash } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/shared/components/Avatar/Avatar";

interface Props {
  onForward: (target: { type: 'direct' | 'room', id: number }) => void;
  onCancel: () => void;
}

export function ForwardModal({ onForward, onCancel }: Props) {
  const conversationPreviews = useAppStore((s: RootState) => s.conversationPreviews);
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);
  const [search, setSearch] = useState("");

  const targets = [
    ...Object.values(conversationPreviews).map(p => ({
      type: 'direct' as const,
      id: p.partner_id,
      name: p.partner_display_name || p.partner_username,
      avatar: null, 
    })),
    ...Object.values(roomPreviews).map(r => ({
      type: 'room' as const,
      id: r.id,
      name: r.name,
      avatar: null,
    }))
  ].filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-card border border-border/50 rounded-2xl shadow-2xl shadow-black/5 ring-1 ring-white/5 w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-lg">Forward message</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              className="w-full bg-background border border-border/50 rounded-xl pl-10 pr-4 py-2.5 text-[15px] outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm transition-shadow"
              placeholder="Who to forward to?"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {targets.map(t => (
            <button
              key={`${t.type}-${t.id}`}
              onClick={() => onForward(t)}
              className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-accent active:scale-[0.98] text-left group"
            >
              <div className="relative">
                <Avatar 
                  name={t.name}
                  src={null}
                  size="large"
                />
                <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 border border-border shadow-sm">
                  {t.type === 'direct' ? <User className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate text-sm">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.type === 'direct' ? 'Direct Message' : 'Room'}
                </div>
              </div>
              <Send className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mr-2" />
            </button>
          ))}
          {targets.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No one found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
