import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "./base";
import { authApi } from "./auth";
import { CLIENT_PROTOCOL_HEADER } from "@/shared/clientProtocol";

const { getStringMock, removeMock } = vi.hoisted(() => ({
  getStringMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock("@/shared/utils/storage", () => ({
  STORAGE_KEYS: { TOKEN: "token", USER: "user" },
  storage: { getString: getStringMock, remove: removeMock },
}));

describe("TURN credential API", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    getStringMock.mockReset();
    removeMock.mockReset();
    getStringMock.mockReturnValue("auth-token");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests TURN credentials through the authenticated API client", async () => {
    const credentials = {
      urls: ["turn:one.example.test", "turns:two.example.test"],
      username: "1700000600:user",
      credential: "secret",
      expires_at: 1_700_000_600,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: credentials })),
    });

    await expect(authApi.getTurnCredentials()).resolves.toEqual(credentials);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/turn-credentials`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer auth-token",
          [CLIENT_PROTOCOL_HEADER]: "1",
        },
      },
    );
  });
});
