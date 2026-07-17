import type { ResourceRef } from "@/shared/types";

export function serializeResourceRef(ref: ResourceRef): string {
  return typeof ref === "number" ? `number:${ref}` : `string:${ref}`;
}
