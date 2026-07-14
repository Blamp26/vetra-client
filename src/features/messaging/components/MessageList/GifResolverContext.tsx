import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { giphyApi, type VetraGif } from "@/api/giphy";

type GifResolverValue = { gifs: Record<string, VetraGif>; register: (id: string) => void };
const GifResolverContext = createContext<GifResolverValue>({ gifs: {}, register: () => undefined });

export function GifResolverProvider({ children }: { children: ReactNode }) {
  const [gifs, setGifs] = useState<Record<string, VetraGif>>({});
  const pending = useRef(new Set<string>());
  const scheduled = useRef(false);
  const register = useCallback((id: string) => {
    if (gifs[id] || pending.current.has(id) || !giphyApi.isConfigured()) return;
    pending.current.add(id);
    if (scheduled.current) return;
    scheduled.current = true;
    queueMicrotask(async () => {
      scheduled.current = false;
      const ids = [...pending.current].slice(0, 100);
      ids.forEach((value) => pending.current.delete(value));
      try {
        const resolved = await giphyApi.getByIds(ids);
        setGifs((current) => Object.fromEntries([...Object.entries(current), ...resolved.map((gif) => [gif.providerId, gif])]));
      } catch { /* unavailable GIFs remain stable placeholders */ }
    });
  }, [gifs]);
  return <GifResolverContext.Provider value={{ gifs, register }}>{children}</GifResolverContext.Provider>;
}

export function useGifResolver() { return useContext(GifResolverContext); }
