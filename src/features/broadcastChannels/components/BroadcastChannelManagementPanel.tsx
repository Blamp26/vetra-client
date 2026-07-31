import { useEffect, useState } from "react";
import { broadcastChannelsApi } from "@/api/broadcastChannels";
import { Button } from "@/shared/components/Button";
import { postFormData } from "@/api/base";
import type { BroadcastAdmin, BroadcastCapability, BroadcastGovernanceState, BroadcastInvite, BroadcastJoinRequest, BroadcastOwnershipState, BroadcastSubscriber } from "../types";
import { isReservedBroadcastRootName } from "../rootNames";

const CAPABILITIES: BroadcastCapability[] = ["publish", "edit_others_publications", "delete_others_publications", "pin_publications", "view_subscribers", "ban_users"];

export function BroadcastChannelManagementPanel({ channelId, channelVisibility, description: initialDescription, avatarUrl: initialAvatarUrl, onClose, onRefresh }: { channelId: string; channelVisibility: "public" | "private"; description?: string | null; avatarUrl?: string | null; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [governance, setGovernance] = useState<BroadcastGovernanceState | null>(null);
  const [admins, setAdmins] = useState<BroadcastAdmin[]>([]);
  const [requests, setRequests] = useState<BroadcastJoinRequest[]>([]);
  const [subscribers, setSubscribers] = useState<BroadcastSubscriber[]>([]);
  const [invite, setInvite] = useState<BroadcastInvite | null>(null);
  const [ownership, setOwnership] = useState<BroadcastOwnershipState | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [reactions, setReactions] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [busy, setBusy] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<string | null>(null);
  const [appointmentUser, setAppointmentUser] = useState("");
  const [appointmentTier, setAppointmentTier] = useState<"full" | "limited">("limited");
  const [appointmentCaps, setAppointmentCaps] = useState<BroadcastCapability[]>(["publish"]);
  const [editTier, setEditTier] = useState<"full" | "limited">("limited");
  const [editCaps, setEditCaps] = useState<BroadcastCapability[]>([]);
  const [transferTarget, setTransferTarget] = useState("");

  const refresh = async () => {
    setStatus("Loading…");
    try {
      const state = await broadcastChannelsApi.governance(channelId);
      setGovernance(state);
      const adminResult = await broadcastChannelsApi.administrators(channelId);
      setAdmins(adminResult);
      if (state.role === "owner" || state.tier === "full") {
        const [pending, ownerState] = await Promise.all([
          channelVisibility === "private" ? broadcastChannelsApi.pendingRequests(channelId).catch(() => []) : Promise.resolve([]),
          broadcastChannelsApi.ownership(channelId).catch(() => null),
        ]);
        setRequests(pending); setOwnership(ownerState);
        if (channelVisibility === "private") setInvite(await broadcastChannelsApi.invite(channelId).catch(() => null));
      }
      if (state.role === "owner" || state.tier === "full" || state.capabilities?.includes("view_subscribers")) {
        setSubscribers(await broadcastChannelsApi.subscribers(channelId).catch(() => []));
      }
      setStatus("");
    } catch { setStatus("Channel management unavailable"); }
  };
  useEffect(() => { void refresh(); return () => { setInvite(null); }; }, [channelId, channelVisibility]);

  useEffect(() => {
    const admin = admins.find((item) => item.user_public_id === selectedAdmin);
    if (admin) { setEditTier(admin.tier); setEditCaps(admin.capabilities); }
  }, [admins, selectedAdmin]);

  const usernameError = isReservedBroadcastRootName(username) ? "That username is reserved by the application." : "";
  async function mutate(operation: () => Promise<unknown>) { if (usernameError) { setStatus(usernameError); return; } setBusy(true); try { await operation(); await refresh(); await onRefresh(); } catch { setStatus("Action unavailable"); } finally { setBusy(false); } }
  async function saveProfile() { const body: Record<string, unknown> = { display_name: displayName || undefined, description: description || null }; if (avatarFile) { const form = new FormData(); form.append("file", avatarFile); const uploaded = await postFormData<{ media_file_id: string }>("/media", form); body.avatar_media_file_id = uploaded.media_file_id; } else if (avatarUrl === null) body.avatar_media_file_id = null; await broadcastChannelsApi.settings(channelId, body); setAvatarFile(null); }
  const canManage = governance?.role === "owner" || governance?.tier === "full";
  const canPublish = governance?.role === "owner" || governance?.tier === "full" || governance?.capabilities?.includes("publish");
  const ownerOnly = governance?.role === "owner";
  const toggleCapability = (values: BroadcastCapability[], capability: BroadcastCapability) => {
    const next = values.includes(capability) ? values.filter((value) => value !== capability) : [...values, capability];
    return (next.includes("ban_users") && !next.includes("view_subscribers") ? [...next, "view_subscribers" as BroadcastCapability] : next) as BroadcastCapability[];
  };

  return <aside role="dialog" aria-label="Broadcast channel settings" className="absolute inset-y-0 right-0 z-10 w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5 shadow-xl">
    <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Channel settings</h2><Button variant="ghost" onClick={onClose}>Close</Button></div>
    {status && <p role="status" className="mb-3 text-sm text-muted-foreground">{status}</p>}
    {governance && <p className="mb-4 text-sm">Role: <strong>{governance.tier ?? governance.role}</strong></p>}
    {canManage && <section className="space-y-3 border-b border-border pb-4"><h3 className="font-medium">Profile</h3><label className="block text-sm">Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded border border-border bg-background p-2" /></label><label className="block text-sm">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="mt-1 w-full rounded border border-border bg-background p-2" /></label><label className="block text-sm">Avatar<input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" /></label>{avatarUrl && <><img src={avatarUrl} alt="Channel avatar" className="h-16 w-16 rounded-full object-cover" /><Button variant="secondary" disabled={busy} onClick={() => { setAvatarUrl(null); setAvatarFile(null); }}>Clear avatar</Button></>}<label className="block text-sm">Allowed reactions<input value={reactions} onChange={(e) => setReactions(e.target.value)} placeholder="👍, ❤️" className="mt-1 w-full rounded border border-border bg-background p-2" /></label><Button disabled={busy} onClick={() => void mutate(async () => { await saveProfile(); if (reactions) await broadcastChannelsApi.settings(channelId, { allowed_reactions: reactions.split(",").map((x) => x.trim()).filter(Boolean) }); })}>Save profile</Button></section>}
    {ownerOnly && <section className="space-y-3 border-b border-border py-4"><h3 className="font-medium">Owner settings</h3><label className="block text-sm">Public username<input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded border border-border bg-background p-2" /></label><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.settings(channelId, { visibility: "public", username }))}>Make public</Button><Button disabled={busy} variant="secondary" onClick={() => void mutate(() => broadcastChannelsApi.settings(channelId, { visibility: "private" }))}>Make private</Button><Button disabled={busy} variant="secondary" onClick={() => void mutate(() => broadcastChannelsApi.settings(channelId, { content_protection_enabled: true }))}>Enable protection</Button><Button disabled={busy} variant="secondary" onClick={() => void mutate(() => broadcastChannelsApi.settings(channelId, { personal_profile_posting_enabled: true }))}>Allow profile posting</Button></div></section>}
    {channelVisibility === "private" && canManage && <section className="space-y-3 border-b border-border py-4"><h3 className="font-medium">Invite link</h3>{invite ? <><code className="block break-all rounded bg-muted p-2 text-xs">{`${window.location.origin}/invite/${invite.token}`}</code><div className="flex gap-2"><Button onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/invite/${invite.token}`)}>Copy</Button><Button variant="secondary" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.regenerateInvite(channelId))}>Regenerate</Button><Button variant="secondary" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.disableInvite(channelId))}>Disable</Button></div></> : <Button disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.createInvite(channelId))}>Create invite</Button>}</section>}
    {canManage && channelVisibility === "private" && <section className="space-y-2 border-b border-border py-4"><h3 className="font-medium">Join requests</h3>{requests.length === 0 ? <p className="text-sm text-muted-foreground">No pending requests.</p> : requests.map((request) => <div key={request.user_public_id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{request.user_public_id}</span><Button disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.approveRequest(channelId, request.user_public_id))}>Approve</Button><Button variant="secondary" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.rejectRequest(channelId, request.user_public_id))}>Reject</Button></div>)}</section>}
    {canManage && <section className="space-y-3 border-b border-border py-4"><h3 className="font-medium">Administrators</h3><div className="flex gap-2"><input aria-label="Administrator public ID" value={appointmentUser} onChange={(e) => setAppointmentUser(e.target.value)} placeholder="User public ID" className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm" /><select aria-label="Administrator tier" value={appointmentTier} onChange={(e) => setAppointmentTier(e.target.value as "full" | "limited")} className="rounded border border-border bg-background p-2 text-sm"><option value="limited">Limited</option><option value="full">Full</option></select><Button disabled={busy || !appointmentUser} onClick={() => void mutate(() => broadcastChannelsApi.appointAdministrator(channelId, appointmentUser, appointmentTier, appointmentTier === "limited" ? appointmentCaps : []))}>Appoint</Button></div>{admins.length === 0 ? <p className="text-sm text-muted-foreground">No administrators.</p> : admins.map((admin) => <div key={admin.user_public_id} className="flex items-center gap-2 text-sm"><button type="button" className="min-w-0 flex-1 truncate text-left underline" onClick={() => setSelectedAdmin(admin.user_public_id)}>{admin.user_public_id}</button><span>{admin.tier}</span><Button variant="secondary" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.removeAdministrator(channelId, admin.user_public_id))}>Remove</Button></div>)}{selectedAdmin && <div className="rounded border border-border p-3"><label className="text-sm">Tier<select aria-label="Edited administrator tier" value={editTier} onChange={(e) => setEditTier(e.target.value as "full" | "limited")} className="ml-2 rounded border border-border bg-background p-1"><option value="limited">Limited</option><option value="full">Full</option></select></label><div className="mt-2">{CAPABILITIES.map((capability) => <label key={capability} className="mr-3 inline-flex gap-1 text-xs"><input type="checkbox" checked={editCaps.includes(capability)} onChange={() => setEditCaps(toggleCapability(editCaps, capability))} />{capability}</label>)}</div><Button className="mt-2" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.updateAdministrator(channelId, selectedAdmin, { tier: editTier, capabilities: editTier === "limited" ? editCaps : [] }).then(() => setSelectedAdmin(null)))}>Save permissions</Button></div>}<div className="mt-2">{CAPABILITIES.map((capability) => <label key={capability} className="mr-3 inline-flex gap-1 text-xs"><input type="checkbox" checked={appointmentCaps.includes(capability)} onChange={() => setAppointmentCaps(toggleCapability(appointmentCaps, capability))} />{capability}</label>)}</div><p className="text-xs text-muted-foreground">Only the six approved limited capabilities are available. ban_users implies view_subscribers.</p></section>}
    {subscribers.length > 0 && <section className="space-y-2 border-b border-border py-4"><h3 className="font-medium">Subscribers</h3>{subscribers.map((subscriber) => <div key={subscriber.public_id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{subscriber.display_name ?? subscriber.username}</span>{(canManage || governance?.capabilities?.includes("ban_users")) && <Button variant="secondary" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.block(channelId, subscriber.public_id))}>Block</Button>}</div>)}</section>}
    {ownership?.decline_available && <section className="space-x-2 py-4"><Button disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.acceptOwnership(channelId))}>Accept ownership</Button><Button variant="secondary" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.declineOwnership(channelId))}>Decline ownership</Button></section>}
    {ownerOnly && <section className="space-y-2 border-b border-border py-4"><h3 className="font-medium">Transfer ownership</h3><p className="text-xs text-muted-foreground">Transfer is available only to an active administrator.</p><div className="flex gap-2"><input aria-label="Ownership transfer administrator public ID" value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} placeholder="Administrator public ID" className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm" /><Button disabled={busy || !transferTarget || !admins.some((admin) => admin.user_public_id === transferTarget)} onClick={() => void mutate(() => broadcastChannelsApi.transferOwnership(channelId, transferTarget))}>Transfer</Button></div></section>}
    {governance?.role === "administrator" && <section className="space-x-2 py-4"><Button variant="secondary" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.declineAdministrator(channelId))}>Decline administrator role</Button><Button variant="secondary" disabled={busy} onClick={() => void mutate(() => broadcastChannelsApi.leave(channelId))}>Leave channel</Button></section>}
    {!canPublish && <p className="mt-4 text-xs text-muted-foreground">Publishing is unavailable for the current role.</p>}
  </aside>;
}
