import type { ResourceRef } from "@/shared/types";

type RefEntity = {
  id: number;
  public_id?: string | null;
};

export function userRef(user?: RefEntity | null): ResourceRef | undefined {
  return user?.public_id ?? user?.id;
}

export function serverRef(server?: RefEntity | null): ResourceRef | undefined {
  return server?.public_id ?? server?.id;
}

export function roomRef(room?: RefEntity | null): ResourceRef | undefined {
  return room?.public_id ?? room?.id;
}

export function withFallbackRef(
  fallbackId: number,
  explicitRef?: ResourceRef | null,
  entity?: RefEntity | null,
): ResourceRef {
  return explicitRef ?? entity?.public_id ?? fallbackId;
}

export function parseNumericRef(ref: string | undefined): number | null {
  if (!ref || !/^\d+$/.test(ref)) return null;
  return Number(ref);
}
