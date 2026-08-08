import { useEffect, useId, useState } from "react";
import { roomsApi, type GroupDiscoveryResult } from "@/api/rooms";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import { Button } from "@/shared/components/Button";
import { X } from "lucide-react";
import { useAppStore } from "@/store";
import { roomChatForPreview } from "@/shared/utils/chatRoutes";

export function GroupDiscoveryModal({ onClose }: { onClose: () => void }) {
  const upsertRoomPreview = useAppStore((state) => state.upsertRoomPreview);
  const setActiveChat = useAppStore((state) => state.setActiveChat);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [results, setResults] = useState<GroupDiscoveryResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError(null);
      roomsApi.discover(value).then(setResults).catch((e) => setError(e instanceof Error ? e.message : "Discovery failed.")).finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const join = async (group: GroupDiscoveryResult) => {
    setBusy(true);
    setError(null);
    try {
      const result = await roomsApi.publicJoin(group.public_username);
      if (result.status === "pending") setError("Join request submitted for approval.");
      else {
        const room = (await roomsApi.getList()).find((candidate) => candidate.id === group.id);
        if (room) { upsertRoomPreview(room); setActiveChat(roomChatForPreview(room)); }
        onClose();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join group."); }
    finally { setBusy(false); }
  };

  const joinByInvite = async () => {
    const token = inviteToken.trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const preview = await roomsApi.resolveInvite(token);
      const result = await roomsApi.joinInvite(token);
      if (result.status === "pending") { setError("Join request submitted for approval."); return; }
      const room = (await roomsApi.getList()).find((candidate) => candidate.id === preview.id);
      if (room) { upsertRoomPreview(room); setActiveChat(roomChatForPreview(room)); }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Invite is invalid, expired, revoked, or exhausted."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} labelledBy={titleId} className="flex w-full max-w-lg flex-col">
      <header className="flex items-center justify-between border-b border-border p-4">
        <h2 id={titleId} className="text-lg">Discover or join groups</h2>
        <IconButton label="Close group discovery" size="compact" onClick={onClose}><X className="h-4 w-4" /></IconButton>
      </header>
      <div className="space-y-3 p-4">
        <div className="flex gap-2">
          <TextInput aria-label="Invite token" value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} placeholder="Invite token" disabled={busy} />
          <Button type="button" size="compact" variant="primary" disabled={busy || !inviteToken.trim()} onClick={() => void joinByInvite()}>Join invite</Button>
        </div>
        <TextInput aria-label="Search name or public username" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or public username" disabled={busy} />
        {error && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{error}</p>}
        {busy && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Loading…</p>}
        <div className="divide-y divide-border rounded-lg border border-border">
          {results.map((group) => <article key={group.id} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{group.name}</h3><p className="truncate text-xs text-muted-foreground">@{group.public_username} · {group.member_count} members</p><p className="line-clamp-2 text-xs">{group.description}</p></div><Button type="button" size="compact" variant="primary" disabled={busy || group.membership === "member"} onClick={() => void join(group)}>{group.membership === "member" ? "Joined" : "Join"}</Button></article>)}
        </div>
      </div>
    </Dialog>
  );
}
