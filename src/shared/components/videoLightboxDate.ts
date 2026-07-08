export function formatVideoLightboxTimestamp(
  iso: string,
  now = new Date(),
  locale = "en-GB",
) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const targetStart = new Date(date);
  targetStart.setHours(0, 0, 0, 0);

  const dayDiff = Math.round((todayStart.getTime() - targetStart.getTime()) / 86_400_000);

  if (dayDiff === 0) {
    return `Today, ${timeLabel}`;
  }

  if (dayDiff === 1) {
    return `Yesterday, ${timeLabel}`;
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  const dateLabel = new Intl.DateTimeFormat(locale, sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" }).format(date);

  return `${dateLabel}, ${timeLabel}`;
}
