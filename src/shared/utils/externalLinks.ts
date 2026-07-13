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
