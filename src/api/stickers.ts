import { get, post, put, del } from "./base";
import type { StickerMessage, StickerPack } from "@/shared/types";
export const stickersApi = {
  list: (kind?: "sticker" | "custom_emoji") => get<StickerPack[]>(kind ? `/stickers?kind=${kind}` : "/stickers"),
  get: (id: string) => get<StickerPack>(`/stickers/${id}`),
  createPack: (title: string, visibility = "private", kind: "sticker" | "custom_emoji" = "sticker") => post<StickerPack>("/stickers/packs", { title, visibility, kind }),
  add: (packId: string, data: Record<string, unknown>) => post<StickerMessage>(`/stickers/packs/${packId}/stickers`, data),
  updatePack: (id: string, data: Record<string, unknown>) => put<StickerPack>(`/stickers/packs/${id}`, data),
  deletePack: (id: string) => del(`/stickers/packs/${id}`),
  install: (id: string) => post(`/stickers/packs/${id}/install`, {}),
  uninstall: (id: string) => del(`/stickers/packs/${id}/install`),
};
