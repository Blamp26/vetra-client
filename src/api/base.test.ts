import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getDefaultApiBaseUrl, post, unwrapApiResponse } from "./base";

const { getStringMock, removeMock } = vi.hoisted(() => ({
  getStringMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock("@/shared/utils/storage", () => ({
  STORAGE_KEYS: {
    TOKEN: "token",
    USER: "user",
  },
  storage: {
    getString: getStringMock,
    remove: removeMock,
  },
}));

describe("getDefaultApiBaseUrl", () => {
  it("uses the current origin for same-origin deployments", () => {
    expect(getDefaultApiBaseUrl({ origin: "http://146.120.249.160" })).toBe(
      "http://146.120.249.160/api/v1",
    );
  });
});

describe("request error parsing", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    getStringMock.mockReset();
    removeMock.mockReset();
    getStringMock.mockReturnValue(null);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves JSON backend messages and field details", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: "Username is already taken",
          details: {
            username: ["has already been taken"],
          },
        }),
      ),
    });

    await expect(post("/users/register", { username: "tester" })).rejects.toEqual(
      new ApiError("Username is already taken", 422, {
        username: ["has already been taken"],
      }),
    );
  });

  it("falls back safely when the backend response body is empty", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(""),
    });

    await expect(post("/users/login", { username: "tester" })).rejects.toEqual(
      new ApiError("Request failed: 500", 500, undefined),
    );
  });

  it("unwraps Phoenix-style success envelopes for callers", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          data: {
            user: { id: 1, username: "Blamp26" },
            token: "token-123",
          },
        }),
      ),
    });

    await expect(post("/users/login", { username: "Blamp26" })).resolves.toEqual({
      user: { id: 1, username: "Blamp26" },
      token: "token-123",
    });
  });

  it("keeps supporting raw success responses without a data envelope", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          user: { id: 1, username: "Blamp26" },
          token: "token-raw",
        }),
      ),
    });

    await expect(post("/users/login", { username: "Blamp26" })).resolves.toEqual({
      user: { id: 1, username: "Blamp26" },
      token: "token-raw",
    });
  });
});

describe("unwrapApiResponse", () => {
  it("returns data from a success envelope", () => {
    expect(
      unwrapApiResponse({
        data: {
          items: [1, 2, 3],
        },
      }),
    ).toEqual({
      items: [1, 2, 3],
    });
  });

  it("returns raw success payloads unchanged", () => {
    expect(
      unwrapApiResponse({
        items: [1, 2, 3],
      }),
    ).toEqual({
      items: [1, 2, 3],
    });
  });
});
