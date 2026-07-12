export type ConversationOrderItem = {
  id: number;
  kind: "direct" | "room";
  time: string | null | undefined;
  pinned?: boolean | null;
};

export function sortConversationItems<T extends ConversationOrderItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pinnedDifference = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinnedDifference !== 0) return pinnedDifference;

    const activityDifference = activityTime(b.time) - activityTime(a.time);
    if (activityDifference !== 0) return activityDifference;

    const kindDifference = a.kind.localeCompare(b.kind);
    return kindDifference !== 0 ? kindDifference : a.id - b.id;
  });
}

function activityTime(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
