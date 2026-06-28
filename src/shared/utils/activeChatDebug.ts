import type { ActiveChat } from "@/shared/types";
import { activeChatKey, sameActiveChat } from "@/shared/utils/chatRoutes";

const DEBUG_STORAGE_KEY = "VETRA_DEBUG_ACTIVE_CHAT";
const LOOP_WINDOW_MS = 1000;
const LOOP_THRESHOLD = 15;
const LOOP_HISTORY_LIMIT = 15;

type ActiveChatLogEntry = {
  at: number;
  source: string;
  prevKey: string;
  nextKey: string;
  hash: string;
};

const recentEntries: ActiveChatLogEntry[] = [];

function isBrowser() {
  return typeof window !== "undefined";
}

export function isActiveChatDebugEnabled(): boolean {
  if (!isBrowser()) return false;

  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function currentHash(): string {
  if (!isBrowser()) return "";
  return window.location.hash;
}

function appendEntry(entry: ActiveChatLogEntry) {
  recentEntries.push(entry);

  while (recentEntries.length > LOOP_HISTORY_LIMIT) {
    recentEntries.shift();
  }

  const cutoff = entry.at - LOOP_WINDOW_MS;
  const entriesInWindow = recentEntries.filter((item) => item.at >= cutoff);

  if (entriesInWindow.length <= LOOP_THRESHOLD) return;

  console.groupCollapsed("[activeChat-loop-detected]");
  console.table(
    entriesInWindow.map((item) => ({
      source: item.source,
      prevKey: item.prevKey,
      nextKey: item.nextKey,
      hash: item.hash,
      at: new Date(item.at).toISOString(),
    })),
  );
  console.groupEnd();
}

export function debugActiveChatTransition(
  source: string | undefined,
  previous: ActiveChat | null,
  next: ActiveChat | null,
) {
  if (!isActiveChatDebugEnabled()) return;

  const prevKey = activeChatKey(previous);
  const nextKey = activeChatKey(next);
  const same = sameActiveChat(previous, next);
  const hash = currentHash();
  const safeSource = source ?? "unknown";

  appendEntry({
    at: Date.now(),
    source: safeSource,
    prevKey,
    nextKey,
    hash,
  });

  console.groupCollapsed(`[activeChat] ${safeSource} ${prevKey} -> ${nextKey}`);
  console.log({
    source: safeSource,
    previous,
    next,
    previousKey: prevKey,
    nextKey,
    sameActiveChat: same,
    hash,
  });
  console.trace("[activeChat-trace]");
  console.groupEnd();
}
