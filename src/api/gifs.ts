import { del, get, post } from "./base";

export type SavedGif = { provider: "giphy"; provider_id: string; width: number; height: number; title: string | null; last_used_at?: string };

export const gifsApi = {
  saved: () => get<SavedGif[]>("/gifs/saved"),
  save: (gif: Omit<SavedGif, "last_used_at">) => post<SavedGif>("/gifs/saved", gif),
  remove: (provider: string, providerId: string) => del<{ removed: boolean }>(`/gifs/saved/${encodeURIComponent(provider)}/${encodeURIComponent(providerId)}`),
};
