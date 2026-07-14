export type GiphyAnalytics = {
  onload?: string;
  onclick?: string;
  onsent?: string;
};

export type VetraGif = {
  provider: "giphy";
  providerId: string;
  title: string | null;
  width: number;
  height: number;
  previewMp4Url: string | null;
  previewWebpUrl: string | null;
  previewStillUrl: string | null;
  messageMp4Url: string | null;
  messageWebpUrl: string | null;
  analytics: GiphyAnalytics;
};

export type GiphyPage = {
  results: VetraGif[];
  nextOffset: number;
  hasMore: boolean;
};

export class GiphyError extends Error {
  constructor(message: string, public readonly kind: "not_configured" | "unauthorized" | "rate_limited" | "offline" | "malformed" | "request") {
    super(message);
    this.name = "GiphyError";
  }
}

const API = "https://api.giphy.com/v1";
const KEY_STORAGE = "vetra:giphy-customer-id";
let customerIdPromise: Promise<string | null> | null = null;

function apiKey() {
  return (import.meta.env as { VITE_GIPHY_API_KEY?: string }).VITE_GIPHY_API_KEY?.trim() || null;
}

function language() {
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
}

function normalize(data: any): VetraGif | null {
  const id = typeof data?.id === "string" ? data.id : null;
  const images = data?.images;
  if (!id || !images) return null;
  const rendition = (name: string) => images[name] ?? null;
  const grid = rendition("fixed_width_small") ?? rendition("fixed_width") ?? rendition("original");
  const message = rendition("original") ?? rendition("fixed_width");
  const width = Number(message?.width ?? grid?.width);
  const height = Number(message?.height ?? grid?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    provider: "giphy",
    providerId: id,
    title: typeof data.title === "string" && data.title ? data.title : null,
    width,
    height,
    previewMp4Url: grid?.mp4 ?? rendition("fixed_width")?.mp4 ?? null,
    previewWebpUrl: grid?.webp ?? rendition("fixed_width")?.webp ?? rendition("original")?.webp ?? null,
    previewStillUrl: grid?.url ?? rendition("fixed_width")?.url ?? rendition("original")?.url ?? null,
    messageMp4Url: message?.mp4 ?? null,
    messageWebpUrl: message?.webp ?? null,
    analytics: {
      onload: data.analytics?.onload,
      onclick: data.analytics?.onclick,
      onsent: data.analytics?.onsent,
    },
  };
}

async function request(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  if (!apiKey()) throw new GiphyError("GIF search is not configured", "not_configured");
  const query = new URLSearchParams({ api_key: apiKey()!, bundle: "messaging_non_clips", rating: "pg-13", lang: language(), ...params });
  let response: Response;
  try {
    response = await fetch(`${API}${path}?${query.toString()}`, { signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new GiphyError("GIF search is unavailable while offline", "offline");
  }
  if (response.status === 401 || response.status === 403) throw new GiphyError("GIPHY API key is invalid", "unauthorized");
  if (response.status === 429) throw new GiphyError("GIF search is temporarily rate limited", "rate_limited");
  if (!response.ok) throw new GiphyError("GIF search failed", "request");
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.meta?.response_id !== "string" || !body.meta.response_id) throw new GiphyError("GIPHY returned an invalid response", "malformed");
  return body;
}

function pageResult(body: any, offset: number): GiphyPage {
  const count = Number.isInteger(body.pagination?.count) && body.pagination.count > 0
    ? body.pagination.count
    : 0;
  const totalCount = Number.isInteger(body.pagination?.total_count) && body.pagination.total_count > 0
    ? body.pagination.total_count
    : 0;
  const results = (Array.isArray(body.data) ? body.data : [])
    .map(normalize)
    .filter(Boolean) as VetraGif[];
  const nextOffset = offset + count;
  return {
    results,
    nextOffset,
    hasMore: count > 0 && totalCount > nextOffset,
  };
}

export const giphyApi = {
  isConfigured: () => Boolean(apiKey()),
  async search(query: string, offset = 0, signal?: AbortSignal): Promise<GiphyPage> {
    const body = await request("/gifs/search", { q: query, limit: "25", offset: String(offset) }, signal);
    return pageResult(body, offset);
  },
  async trending(offset = 0, signal?: AbortSignal): Promise<GiphyPage> {
    const body = await request("/gifs/trending", { limit: "25", offset: String(offset) }, signal);
    return pageResult(body, offset);
  },
  async getByIds(ids: string[], signal?: AbortSignal) {
    if (ids.length === 0) return [];
    const body = await request("/gifs", { ids: ids.slice(0, 100).join(",") }, signal);
    return (Array.isArray(body.data) ? body.data : []).map(normalize).filter(Boolean) as VetraGif[];
  },
  async customerId() {
    if (customerIdPromise) return customerIdPromise;
    customerIdPromise = (async () => {
    try {
      const existing = localStorage.getItem(KEY_STORAGE);
      if (existing) return existing;
    } catch { /* storage may be unavailable */ }
    if (!apiKey()) return null;
    try {
      const body = await request("/randomid", {});
      const id = typeof body.data?.random_id === "string" ? body.data.random_id : null;
      if (id) {
        try { localStorage.setItem(KEY_STORAGE, id); } catch { /* best effort */ }
      }
      return id;
    } catch { return null; }
    })();
    return customerIdPromise;
  },
  async analytics(url: string | undefined, customerId: string | null) {
    if (!url) return;
    try {
      const target = new URL(url);
      if (customerId) target.searchParams.set("customer_id", customerId);
      target.searchParams.set("ts", String(Date.now()));
      await fetch(target.toString(), { mode: "no-cors", keepalive: true });
    } catch { /* analytics never blocks messaging */ }
  },
};
