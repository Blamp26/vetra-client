import { useEffect, useState } from "react";
import type { PollProjection } from "@/shared/types";
import type { SocketManager } from "@/services/socket";

export function PollCard({ poll, messageId, roomId, socketManager }: { poll: PollProjection; messageId: number; roomId: number; socketManager: SocketManager }) {
  const [selected, setSelected] = useState<number[]>(poll.selected_option_ids);
  const [state, setState] = useState(poll);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => socketManager.onPollUpdated(roomId, (next) => {
    if (next.message_id === messageId) { setState(next); setSelected(next.selected_option_ids); }
  }), [messageId, roomId, socketManager]);
  const closed = state.status === "closed";
  const multiple = state.settings.multiple_answers === true;
  const choose = (id: number) => setSelected((current) => multiple ? current.includes(id) ? current.filter((x) => x !== id) : [...current, id] : [id]);
  const vote = async () => {
    if (!selected.length || closed) return;
    try { setError(null); setState(await socketManager.votePoll(roomId, messageId, selected)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Vote failed"); }
  };
  return <section aria-label="Poll" data-testid="poll-card" className="w-[320px] max-w-full space-y-2">
    <h3 className="font-semibold">{state.question}</h3>
    {state.description && <p className="text-sm opacity-80">{state.description}</p>}
    <div className="space-y-1">{state.options.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-black/5">
      <input type={multiple ? "checkbox" : "radio"} name={`poll-${messageId}`} checked={selected.includes(option.id)} disabled={closed} onChange={() => choose(option.id)} />
      <span className="flex-1">{option.label}</span>{option.votes > 0 && <span className="text-xs opacity-70">{option.votes}</span>}
    </label>)}</div>
    {!closed && <button type="button" disabled={!selected.length} onClick={() => void vote()}>Vote</button>}
    {state.settings.allow_adding_options === true && !closed && <button type="button" onClick={() => { const label = window.prompt("New option"); if (label) void socketManager.addPollOption(roomId, messageId, label).then(setState).catch((e) => setError(e instanceof Error ? e.message : "Option failed")); }}>Add option</button>}
    {state.closes_at && <time dateTime={state.closes_at}>{closed ? "Closed" : `Closes ${new Date(state.closes_at).toLocaleString()}`}</time>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
