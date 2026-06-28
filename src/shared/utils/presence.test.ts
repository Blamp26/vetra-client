import { describe, expect, it } from "vitest";
import { getPresenceLabel, resolvePresenceStatus } from "./presence";

describe("resolvePresenceStatus", () => {
  it("treats a user with last_seen_at and no live presence as offline", () => {
    expect(
      resolvePresenceStatus({
        userId: 7,
        onlineUserIds: new Set<number>(),
        userStatuses: {},
        fallbackStatus: "online",
        lastSeenAt: "2026-06-27T09:15:00Z",
      }),
    ).toBe("offline");
  });

  it("preserves live online status", () => {
    expect(
      resolvePresenceStatus({
        userId: 7,
        onlineUserIds: new Set<number>([7]),
        userStatuses: { 7: "online" },
      }),
    ).toBe("online");
  });

  it("preserves live away and dnd statuses", () => {
    expect(
      resolvePresenceStatus({
        userId: 7,
        onlineUserIds: new Set<number>([7]),
        userStatuses: { 7: "away" },
      }),
    ).toBe("away");

    expect(
      resolvePresenceStatus({
        userId: 7,
        onlineUserIds: new Set<number>([7]),
        userStatuses: { 7: "dnd" },
      }),
    ).toBe("dnd");
  });

  it("can keep a local fallback status when presence is not available yet", () => {
    expect(
      resolvePresenceStatus({
        userId: 7,
        onlineUserIds: new Set<number>(),
        userStatuses: {},
        fallbackStatus: "away",
        preferFallbackStatusWhenUnknown: true,
      }),
    ).toBe("away");
  });
});

describe("getPresenceLabel", () => {
  it("returns the expected user-facing label", () => {
    expect(getPresenceLabel("offline")).toBe("Offline");
    expect(getPresenceLabel("online")).toBe("Online");
  });
});
