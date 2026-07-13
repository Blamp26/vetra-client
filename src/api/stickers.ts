import { get, post, put, del } from "./base";
import type { StickerMessage, StickerPack } from "@/shared/types";
export const stickersApi = {
  list: () => get<StickerPack[]>("/stickers"),
  get: (id: string) => get<StickerPack>(`/stickers/${id}`),
  createPack: (title: string, visibility = "private") => post<StickerPack>("/stickers/packs", { title, visibility }),
  add: (packId: string, data: Record<string, unknown>) => post<StickerMessage>(`/stickers/packs/${packId}/stickers`, data),
  updatePack: (id: string, data: Record<string, unknown>) => put<StickerPack>(`/stickers/packs/${id}`, data),
  deletePack: (id: string) => del(`/stickers/packs/${id}`),
  install: (id: string) => post(`/stickers/packs/${id}/install`, {}),
  uninstall: (id: string) => del(`/stickers/packs/${id}/install`),
};
