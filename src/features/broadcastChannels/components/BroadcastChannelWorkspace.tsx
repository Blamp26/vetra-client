import { useCallback, useEffect, useMemo, useState } from "react";
import { getState, useAppStore } from "@/store";
import { broadcastChannelsApi } from "@/api/broadcastChannels";
import { storage } from "@/shared/utils/storage";
import { Button } from "@/shared/components/Button";
import { Avatar } from "@/shared/components/Avatar";
import { IconButton } from "@/shared/components/IconButton";
import { ClipboardList, MoreHorizontal } from "lucide-react";
import { EmptyPane } from "@/shared/components/EmptyPane";
import type { BroadcastChannel, BroadcastGovernanceState, BroadcastPublication } from "../types";
import { joinBroadcastTopic } from "../services/broadcastRealtime";
import { BroadcastChannelManagementPanel } from "./BroadcastChannelManagementPanel";
import { postFormData } from "@/api/base";
import { BroadcastPublication as BroadcastPublicationView } from "./BroadcastPublication";
import { BroadcastComposer } from "./BroadcastComposer";
import { ConversationHeaderShell } from "@/features/messaging/components/ConversationPresentation/ConversationHeaderShell";
import { ConversationTimeline } from "@/features/messaging/components/ConversationPresentation/ConversationTimeline";
import { ConversationDateSeparator } from "@/features/messaging/components/ConversationPresentation/ConversationDateSeparator";
import { ConversationMessageGroup } from "@/features/messaging/components/ConversationPresentation/ConversationMessageGroup";

function draftKey(account: string, channel: string) { return `vetra:broadcast-draft:${account}:${channel}`; }

export function BroadcastChannelWorkspace({ channelPublicId, publicationId }: { channelPublicId?: string; publicationId?: string }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const [resolvedChannelId, setResolvedChannelId] = useState(channelPublicId);
  const [resolvedChannel, setResolvedChannel] = useState<BroadcastChannel | null>(null);
  const broadcastChannels = useAppStore((s) => s.broadcastChannels);
  const broadcastPublications = useAppStore((s) => s.broadcastPublications);
  const broadcastCursors = useAppStore((s) => s.broadcastCursors);
  const channel = channelPublicId ? broadcastChannels[channelPublicId] : undefined;
  const feedKey = channelPublicId ?? resolvedChannelId;
  const publications = feedKey ? broadcastPublications[feedKey] ?? [] : [];
  const cursor = feedKey ? broadcastCursors[feedKey] : null;
  const setChannel = useAppStore((s) => s.setBroadcastChannel);
  const setFeed = useAppStore((s) => s.setBroadcastFeed);
  const setSubscription = useAppStore((s) => s.setBroadcastSubscription);
  const setUnread = useAppStore((s) => s.setBroadcastUnread);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(false);
  const [management, setManagement] = useState(false);
  const [governance, setGovernance] = useState<BroadcastGovernanceState | null>(null);
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [forwardDestination, setForwardDestination] = useState("");
  const [forwardType, setForwardType] = useState<"direct_chat" | "group" | "server_text">("direct_chat");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [contentType, setContentType] = useState<"text" | "photo" | "video" | "file" | "album">("text");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [auditRows, setAuditRows] = useState<Array<{ action_type: string; timestamp: string; actor: { display_name: string }; metadata: Record<string, unknown> }>>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [wideLayout, setWideLayout] = useState(() => window.innerWidth > 1000);
  const accountKey = currentUser?.public_id ?? currentUser?.username ?? "account";
  const socketManager = useAppStore((s) => s.socketManager);
  const activeChannel = (resolvedChannel ?? channel ?? (resolvedChannelId ? getState().broadcastChannels[resolvedChannelId] : undefined)) as BroadcastChannel | undefined;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setUnavailable(false); setResolvedChannel(null);
      try {
        if (channelPublicId !== undefined && !channelPublicId.trim()) {
          setUnavailable(true);
          return;
        }
        const resolved: BroadcastChannel = channelPublicId ? await broadcastChannelsApi.get(channelPublicId) : await broadcastChannelsApi.resolveUsername(window.location.pathname.slice(1));
        if (cancelled) return;
        setResolvedChannelId(resolved.public_id); setResolvedChannel(resolved); setChannel(resolved);
        const [feed, subscription, currentGovernance] = await Promise.all([broadcastChannelsApi.feed(resolved.public_id), broadcastChannelsApi.subscription(resolved.public_id).catch(() => null), broadcastChannelsApi.governance(resolved.public_id).catch(() => null)]);
        if (cancelled) return;
        setFeed(resolved.public_id, feed.publications, feed.next_cursor);
        if (subscription) setSubscription(resolved.public_id, subscription);
        setGovernance(currentGovernance);
        setLoading(false);
        try {
          const pinned = await broadcastChannelsApi.pinned(resolved.public_id);
          if (!cancelled) {
            const pinnedPublications = Array.isArray(pinned?.publications) ? pinned.publications : [];
            setPinnedIds(new Set(pinnedPublications.map((item) => item.public_id)));
          }
        } catch {
          if (!cancelled) setPinnedIds(new Set());
        }
        const saved = storage.getString(draftKey(accountKey, resolved.public_id));
        setDraft(saved ?? "");
      } catch { if (!cancelled) setUnavailable(true); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [accountKey, channelPublicId, setChannel, setFeed, setSubscription]);

  useEffect(() => {
    if (!activeChannel?.realtime_topic || !resolvedChannelId) return;
    return joinBroadcastTopic(socketManager, activeChannel.realtime_topic, {
      onPublication: () => { void broadcastChannelsApi.feed(resolvedChannelId).then((page) => setFeed(resolvedChannelId, page.publications, page.next_cursor)).catch(() => undefined); },
      onChanged: () => { void broadcastChannelsApi.feed(resolvedChannelId).then((page) => setFeed(resolvedChannelId, page.publications, page.next_cursor)).catch(() => undefined); },
      onRevoked: () => { setUnavailable(true); getState().clearBroadcastChannel(resolvedChannelId); }
    });
  }, [activeChannel?.realtime_topic, resolvedChannelId, setFeed, socketManager]);

  useEffect(() => { const id = resolvedChannelId; if (!id) return; const unread = getState().broadcastUnread[id]; if (unread) setSubscription(id, { status: "active", muted: Boolean(getState().broadcastSubscriptions[id]?.muted), unread: true }); }, [resolvedChannelId, setSubscription]);

  useEffect(() => {
    if (!resolvedChannelId || !publicationId) return;
    const target = document.getElementById(`broadcast-publication-${publicationId}`);
    target?.scrollIntoView({ block: "center" });
  }, [publicationId, resolvedChannelId, publications]);

  const canPublish = Boolean(activeChannel && activeChannel.status === "active" && (governance?.role === "owner" || governance?.tier === "full" || governance?.capabilities?.includes("publish")));
  const canManage = activeChannel?.status === "active" && (governance?.role === "owner" || governance?.tier === "full");
  const canPin = canManage || governance?.capabilities?.includes("pin_publications");
  const saveDraft = useCallback((value: string) => {
    setDraft(value);
    if (resolvedChannelId) {
      if (value) storage.setString(draftKey(accountKey, resolvedChannelId), value);
      else storage.remove(draftKey(accountKey, resolvedChannelId));
    }
  }, [accountKey, resolvedChannelId]);

  useEffect(() => {
    const update = () => setWideLayout(window.innerWidth > 1000);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const groupedPublications = useMemo(() => {
    const formatDate = (iso: string) => new Date(iso).toLocaleDateString();
    const groups: Array<{ date: string; items: BroadcastPublication[] }> = [];
    for (const publication of publications) {
      const date = formatDate(publication.created_at);
      const last = groups[groups.length - 1];
      if (last?.date === date) last.items.push(publication);
      else groups.push({ date, items: [publication] });
    }
    return groups;
  }, [publications]);

  async function subscribe() { if (!resolvedChannelId) return; setBusy(true); try { const state = await broadcastChannelsApi.subscribe(resolvedChannelId); setSubscription(resolvedChannelId, state); } catch {} finally { setBusy(false); } }
  async function markRead() { if (!resolvedChannelId) return; setBusy(true); try { await broadcastChannelsApi.markRead(resolvedChannelId); setUnread(resolvedChannelId, false); setSubscription(resolvedChannelId, { ...getState().broadcastSubscriptions[resolvedChannelId], unread: false }); } catch {} finally { setBusy(false); } }
  async function publish() { if (!resolvedChannelId || (!draft.trim() && selectedFiles.length === 0)) return; setBusy(true); try { const media = []; for (const file of selectedFiles) { const fd = new FormData(); fd.append("file", file); const uploaded = await postFormData<{ media_file_id: string }>("/media", fd); media.push({ media_file_id: uploaded.media_file_id }); } const item = await broadcastChannelsApi.publish(resolvedChannelId, { content_type: selectedFiles.length > 1 ? "album" : contentType, content: draft.trim() || null, display_identity: "channel", ...(media.length > 0 ? { media } : {}) }); setFeed(resolvedChannelId, [item, ...publications], cursor); saveDraft(""); setSelectedFiles([]); } catch {} finally { setBusy(false); } }
  async function toggleReaction(publication: BroadcastPublication, value: string) { if (!resolvedChannelId || activeChannel?.status === "frozen") return; try { await broadcastChannelsApi.react(resolvedChannelId, publication.public_id, value); const next = await broadcastChannelsApi.publication(resolvedChannelId, publication.public_id); setFeed(resolvedChannelId, publications.map((p) => p.public_id === next.public_id ? next : p), cursor); } catch {} }
  async function loadMore() { if (!resolvedChannelId || !cursor) return; try { const page = await broadcastChannelsApi.feed(resolvedChannelId, cursor); setFeed(resolvedChannelId, page.publications, page.next_cursor, true); } catch {} }
  async function loadAudit(next: string | null = null) { if (!resolvedChannelId) return; try { const page = await broadcastChannelsApi.audit(resolvedChannelId, next); setAuditRows((rows) => next ? [...rows, ...page.events] : page.events); setAuditCursor(page.next_cursor); setAudit(true); } catch { setAudit(false); } }
  async function refreshChannel() { if (!resolvedChannelId) return; const next = await broadcastChannelsApi.get(resolvedChannelId); setResolvedChannel(next); setChannel(next); setGovernance(await broadcastChannelsApi.governance(resolvedChannelId).catch(() => null)); }
  async function deletePublication(publicationId: string) { if (!resolvedChannelId) return; setBusy(true); try { await broadcastChannelsApi.removePublication(resolvedChannelId, publicationId); const page = await broadcastChannelsApi.feed(resolvedChannelId); setFeed(resolvedChannelId, page.publications, page.next_cursor); } catch {} finally { setBusy(false); } }
  async function pinPublication(publicationId: string, pinned: boolean) { if (!resolvedChannelId) return; setBusy(true); try { if (pinned) await broadcastChannelsApi.unpin(resolvedChannelId, publicationId); else await broadcastChannelsApi.pin(resolvedChannelId, publicationId); const next = await broadcastChannelsApi.pinned(resolvedChannelId); setPinnedIds(new Set(next.publications.map((item) => item.public_id))); } catch {} finally { setBusy(false); } }
  async function editPublication(publication: BroadcastPublication) { if (!resolvedChannelId || publication.deleted) return; const content = window.prompt("Edit publication", publication.content ?? ""); if (content === null) return; setBusy(true); try { const next = await broadcastChannelsApi.edit(resolvedChannelId, publication.public_id, { content }); setFeed(resolvedChannelId, publications.map((item) => item.public_id === next.public_id ? next : item), cursor); } catch {} finally { setBusy(false); } }
  async function forwardPublication() { if (!resolvedChannelId || !forwarding || !forwardDestination) return; setBusy(true); try { await broadcastChannelsApi.forward(resolvedChannelId, forwarding, forwardType, forwardDestination); setForwarding(null); setForwardDestination(""); } catch {} finally { setBusy(false); } }

  if (loading) return <EmptyPane title="Loading channel…" density="workspace" className="flex flex-1 items-center justify-center" />;
  if (unavailable || !activeChannel) return <EmptyPane title="Channel unavailable" description="This channel is not available." density="workspace" className="flex flex-1 items-center justify-center" />;
  const subscription = resolvedChannelId ? getState().broadcastSubscriptions[resolvedChannelId] : undefined;

  return <section className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--vetra-shell-chat-bg)]" aria-label="Broadcast channel">
    <ConversationHeaderShell
      testId="broadcast-channel-header"
      avatar={<Avatar name={activeChannel.display_name} src={activeChannel.avatar_url} size="medium" />}
      title={activeChannel.display_name}
      subtitle={`${activeChannel.username ? `@${activeChannel.username}` : "Private channel"} · ${activeChannel.subscriber_count} subscribers`}
      actions={<>
        {activeChannel.visibility === "public" && !subscription && <Button size="compact" onClick={() => void subscribe()} disabled={busy}>Subscribe</Button>}
        {subscription && <IconButton label="Mark channel read" size="compact" onClick={() => void markRead()} disabled={busy}>✓</IconButton>}
        {canManage && <IconButton label="Manage channel" size="compact" onClick={() => setManagement(true)}><MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" /></IconButton>}
        {canManage && <IconButton label="Open audit history" size="compact" onClick={() => void loadAudit()}><ClipboardList className="h-4 w-4" aria-hidden="true" /></IconButton>}
      </>}
    />
    {activeChannel.status === "frozen" && <div className="border-b border-border bg-muted px-5 py-2 text-sm" role="status">This channel is frozen and read-only.</div>}
    <ConversationTimeline
      alignmentMode={wideLayout ? "left-column" : "split"}
      hasContent={groupedPublications.length > 0}
      emptyState={<div className="vt-panel mx-auto max-w-md px-5 py-6 text-center"><div className="space-y-1.5"><span className="vt-kicker">No publications yet</span><p className="text-sm text-muted-foreground">New channel updates will appear here.</p></div></div>}
      hasMore={Boolean(cursor)}
      isLoading={busy}
      onLoadMore={() => void loadMore()}
      loadMoreLabel="Older publications"
      scrollTestId="broadcast-message-list-scroll"
      railTestId="broadcast-message-list-rail"
    >
          {groupedPublications.map(({ date, items }) => <div key={date} className="w-full" data-testid="message-date-group">
            <ConversationDateSeparator date={date} />
            {items.map((publication, index) => {
              const previous = items[index - 1];
              const next = items[index + 1];
              const isConsecutive = Boolean(previous && (previous.author.public_id ?? previous.author.display_name) === (publication.author.public_id ?? publication.author.display_name));
              const isGroupedWithNext = Boolean(next && (next.author.public_id ?? next.author.display_name) === (publication.author.public_id ?? publication.author.display_name));
              const hasMedia = publication.media.length > 0;
              const previousHasMedia = Boolean(previous?.media.length);
              return <ConversationMessageGroup key={publication.public_id} index={index} isConsecutive={isConsecutive} isGroupedWithNext={isGroupedWithNext} isAlbumBoundary={hasMedia || previousHasMedia} isAttachmentRun={isConsecutive && hasMedia && previousHasMedia}>
                <BroadcastPublicationView channel={activeChannel} publication={publication} isConsecutive={isConsecutive} isGroupedWithNext={isGroupedWithNext} alignmentMode={wideLayout ? "left-column" : "split"} canPin={Boolean(canPin)} canEdit={Boolean(canManage || (governance?.capabilities?.includes("edit_others_publications") && publication.display_identity === "author_profile") || (publication.author.public_id === currentUser?.public_id && governance?.capabilities?.includes("edit_others_publications")))} canDelete={Boolean(canManage || (governance?.capabilities?.includes("delete_others_publications") && publication.display_identity === "author_profile") || publication.author.public_id === currentUser?.public_id)} pinned={pinnedIds.has(publication.public_id)} busy={busy} onReaction={(reaction) => void toggleReaction(publication, reaction)} onShare={() => { void navigator.clipboard?.writeText(`${window.location.origin}/#/broadcast/${activeChannel.public_id}/${publication.public_id}`); }} onForward={() => setForwarding(publication.public_id)} onPin={() => void pinPublication(publication.public_id, pinnedIds.has(publication.public_id))} onEdit={() => void editPublication(publication)} onDelete={() => void deletePublication(publication.public_id)} onOpen={() => { window.location.hash = `#/broadcast/${activeChannel.public_id}/${publication.public_id}`; }} />
              </ConversationMessageGroup>;
            })}
          </div>)}
    </ConversationTimeline>
    {canPublish && <BroadcastComposer value={draft} files={selectedFiles} busy={busy} contentType={contentType} onChange={saveDraft} onFiles={setSelectedFiles} onType={setContentType} onSubmit={() => void publish()} />}
    {management && <BroadcastChannelManagementPanel channelId={activeChannel.public_id} channelVisibility={activeChannel.visibility} description={activeChannel.description} avatarUrl={activeChannel.avatar_url} onClose={() => setManagement(false)} onRefresh={refreshChannel} />}
    {forwarding && <div role="dialog" aria-label="Forward publication" className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-sm rounded-lg bg-background p-4"><h2 className="mb-3 font-semibold">Forward publication</h2><select aria-label="Forward destination type" value={forwardType} onChange={(event) => setForwardType(event.target.value as typeof forwardType)} className="mb-2 w-full rounded border border-border bg-background p-2"><option value="direct_chat">Direct chat</option><option value="group">Standalone group</option><option value="server_text">Server text channel</option></select><input aria-label="Forward destination" value={forwardDestination} onChange={(event) => setForwardDestination(event.target.value)} placeholder="Destination public ID" className="mb-3 w-full rounded border border-border bg-background p-2" /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setForwarding(null)}>Cancel</Button><Button disabled={busy || !forwardDestination} onClick={() => void forwardPublication()}>Forward</Button></div></div></div>}
    {audit && <div role="dialog" aria-label="Audit history" className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-border bg-background p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Audit history</h2><Button variant="ghost" onClick={() => setAudit(false)}>Close</Button></div>{auditRows.length === 0 ? <p className="text-sm text-muted-foreground">No audit events.</p> : auditRows.map((event, index) => <div key={`${event.timestamp}-${index}`} className="border-b border-border py-3"><p className="text-sm">{event.action_type.split("_").join(" ")}</p><p className="text-xs text-muted-foreground">{event.actor.display_name} · {new Date(event.timestamp).toLocaleString()}</p></div>)}{auditCursor && <Button variant="secondary" onClick={() => void loadAudit(auditCursor)}>Load more</Button>}</div>}
  </section>;
}
