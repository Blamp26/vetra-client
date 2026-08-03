import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PollComposer } from "./PollComposer";

describe("PollComposer", () => {
  it("validates options and custom deadlines before submission", async () => {
    const onSubmit = vi.fn();
    render(<PollComposer onSubmit={onSubmit} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Poll question"), { target: { value: "Pick" } });
    fireEvent.change(screen.getByLabelText("Poll option 1"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Poll option 2"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText("Poll duration"), { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: "Create poll" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Choose a custom deadline");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables adding options and revoting in correct-answer mode and submits selections", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PollComposer onSubmit={onSubmit} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Poll question"), { target: { value: "Pick" } });
    fireEvent.change(screen.getByLabelText("Poll option 1"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Poll option 2"), { target: { value: "B" } });
    fireEvent.click(screen.getByLabelText("correct answers"));
    expect(screen.queryByLabelText("Correct option 1")).not.toBeNull();
    expect((screen.getByLabelText("allow adding options") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("allow revoting") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Correct option 1"));
    fireEvent.click(screen.getByRole("button", { name: "Create poll" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].correct_positions).toEqual([0]);
  });
});
