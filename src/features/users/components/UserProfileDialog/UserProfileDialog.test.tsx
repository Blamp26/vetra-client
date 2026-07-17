import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { UserProfileDialog } from "./UserProfileDialog";

vi.mock("@/api/auth", () => ({ authApi: { getUser: vi.fn().mockResolvedValue({ id: 2, public_id: "alice-public", username: "alice", display_name: "Alice", bio: "Hello", avatar_url: null, status: "online" }) } }));

describe("UserProfileDialog", () => {
  it("loads and displays a read-only profile", async () => {
    render(<UserProfileDialog target={{ profileId: "alice-public", username: "alice" }} onClose={vi.fn()} />);
    expect(screen.getByTestId("user-profile-loading")).toBeInTheDocument();
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|save|friend|block/i })).not.toBeInTheDocument();
  });
});
