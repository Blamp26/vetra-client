import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { authApi } from "@/api/auth";
import { Avatar } from "@/shared/components/Avatar";
import { Dialog } from "@/shared/components/Dialog";
import type { ResourceRef, User } from "@/shared/types";

type Props = { target: { id: ResourceRef; username: string; displayName?: string | null; avatarUrl?: string | null }; onClose: () => void };

export function UserProfileDialog({ target, onClose }: Props) {
  const titleId = useId();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    void authApi.getUser(target.id).then(setUser).catch(() => setError("Could not load this profile.")).finally(() => setLoading(false));
  };
  useEffect(load, [target.id]);

  return (
    <Dialog open onClose={onClose} labelledBy={titleId} className="vt-modal-panel relative w-full max-w-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold">Profile</h2>
        <button type="button" aria-label="Close profile" className="rounded-md p-2 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <div className="flex flex-col gap-4 px-5 py-5">
        {loading ? <div className="flex items-center gap-3" data-testid="user-profile-loading"><div className="h-12 w-12 animate-pulse rounded-full bg-muted" /><div className="h-4 w-32 animate-pulse rounded bg-muted" /></div> : error ? <div className="space-y-3" role="alert"><p>{error}</p><button type="button" className="text-primary underline" onClick={load}>Retry</button></div> : user ? <><div className="flex items-center gap-3"><Avatar name={user.display_name || user.username} src={user.avatar_url} size="large" /><div><p className="font-semibold">{user.display_name || user.username}</p><p className="text-sm text-muted-foreground">@{user.username}</p></div></div><p className="text-sm text-muted-foreground">{user.status}</p>{user.bio && <p className="whitespace-pre-wrap text-sm">{user.bio}</p>}<p className="font-mono text-xs text-muted-foreground">ID: {user.public_id || user.id}</p></> : null}
      </div>
    </Dialog>
  );
}
