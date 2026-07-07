import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerMock, loginMock, setAuthSessionMock, logoutMock, useAppStoreMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  loginMock: vi.fn(),
  setAuthSessionMock: vi.fn(),
  logoutMock: vi.fn(),
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/api/auth", () => ({
  authApi: {
    register: registerMock,
    login: loginMock,
  },
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

import { ApiError } from "@/api/base";
import { useAuth } from "./useAuth";

describe("useAuth", () => {
  beforeEach(() => {
    registerMock.mockReset();
    loginMock.mockReset();
    setAuthSessionMock.mockReset();
    logoutMock.mockReset();
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        setAuthSession: setAuthSessionMock,
        logout: logoutMock,
      }),
    );
  });

  it("surfaces backend login messages and field details", async () => {
    loginMock.mockRejectedValue(
      new ApiError("Unknown username", 401, { username: ["not found"] }),
    );

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login("tester", "secret");
    });

    await waitFor(() => {
      expect(result.current.error).toEqual({
        message: "Unknown username",
        details: { username: ["not found"] },
      });
    });
  });

  it("surfaces backend register messages and details", async () => {
    registerMock.mockRejectedValue(
      new ApiError("Username is already taken", 422, {
        username: ["has already been taken"],
      }),
    );

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.register("tester", "secret");
    });

    await waitFor(() => {
      expect(result.current.error).toEqual({
        message: "Username is already taken",
        details: { username: ["has already been taken"] },
      });
    });
  });

  it("saves the auth session from a normalized login response", async () => {
    const user = { id: 1, username: "Blamp26" };
    loginMock.mockResolvedValue({
      user,
      token: "token-123",
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login("Blamp26", "secret");
    });

    await waitFor(() => {
      expect(setAuthSessionMock).toHaveBeenCalledWith(user, "token-123");
      expect(result.current.error).toBeNull();
    });
  });

  it("saves the auth session from a normalized register response", async () => {
    const user = { id: 2, username: "NewUser" };
    registerMock.mockResolvedValue({
      user,
      token: "token-456",
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.register("NewUser", "secret");
    });

    await waitFor(() => {
      expect(setAuthSessionMock).toHaveBeenCalledWith(user, "token-456");
      expect(result.current.error).toBeNull();
    });
  });
});
