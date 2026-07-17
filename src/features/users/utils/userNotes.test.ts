import { describe, expect, it, vi } from "vitest";
import { getUserNotes, saveUserNote } from "./userNotes";

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@/shared/utils/storage", () => ({ storage: { get, set } }));

describe("userNotes", () => {
  it("saves, truncates, and removes private notes by stable key", () => {
    get.mockReturnValue({});
    saveUserNote("number:2", "hello");
    expect(set).toHaveBeenLastCalledWith("vetra_user_notes", { "number:2": "hello" });
    get.mockReturnValue({ "number:2": "hello" });
    saveUserNote("number:2", "");
    expect(set).toHaveBeenLastCalledWith("vetra_user_notes", {});
    get.mockReturnValue({});
    expect(getUserNotes()).toEqual({});
  });
});
