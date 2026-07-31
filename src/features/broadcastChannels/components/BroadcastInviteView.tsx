import { useEffect, useState } from "react";
import { broadcastChannelsApi } from "@/api/broadcastChannels";
import { Button } from "@/shared/components/Button";
import { EmptyPane } from "@/shared/components/EmptyPane";

export function BroadcastInviteView({ token }: { token: string }) {
  const [channel, setChannel] = useState<{ channel_public_id: string; display_name: string } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "pending" | "unavailable">("loading");
  useEffect(() => { let cancelled = false; void broadcastChannelsApi.resolveInvite(token).then((value) => { if (!cancelled) { setChannel(value); setState("ready"); } }).catch(() => { if (!cancelled) setState("unavailable"); }); return () => { cancelled = true; }; }, [token]);
  if (state === "loading") return <EmptyPane title="Loading invite…" density="workspace" className="flex flex-1 items-center justify-center" />;
  if (state === "unavailable" || !channel) return <EmptyPane title="Invite unavailable" description="This invite is not available." density="workspace" className="flex flex-1 items-center justify-center" />;
  return <div className="flex flex-1 items-center justify-center p-6"><section className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center"><h1 className="text-lg font-semibold">Join {channel.display_name}</h1>{state === "pending" ? <p className="mt-3 text-sm text-muted-foreground">Your request is pending.</p> : <Button className="mt-4" onClick={() => void broadcastChannelsApi.submitJoinRequest(token).then(() => setState("pending")).catch(() => setState("unavailable"))}>Request access</Button>}</section></div>;
}
