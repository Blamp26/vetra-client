const WEB_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const HOSTNAME = /^(?:(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)\.)+[a-z]{2,63}$/i;

function isIpv4Hostname(hostname: string): boolean {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

function isWebHostname(hostname: string): boolean {
  return hostname === "localhost" || isIpv4Hostname(hostname) || HOSTNAME.test(hostname);
}

/** Normalize a user-entered web address without making unsafe schemes reachable. */
export function normalizeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /[\s\u0000-\u001f\u007f]/.test(trimmed)) return null;

  const hasScheme = WEB_SCHEME.test(trimmed) && !/^[^/:?#]+:\d{1,5}(?:[/?#]|$)/.test(trimmed);
  if (hasScheme && !/^https?:/i.test(trimmed)) return null;

  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !isWebHostname(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export async function openExternalUrl(value: string): Promise<void> {
  if (!isSafeExternalUrl(value)) return;
  if (typeof window === "undefined") return;

  // Re-validate at the point of opening so this remains safe if callers later
  // resolve or transform a URL asynchronously.
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if ("__TAURI_INTERNALS__" in window) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url.href);
    return;
  }

  window.open(url.href, "_blank", "noopener,noreferrer");
}
