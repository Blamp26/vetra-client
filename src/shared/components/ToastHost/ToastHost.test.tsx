import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastHost } from "./ToastHost";

function dispatchToast(detail: Record<string, unknown>) {
  fireEvent(window, new CustomEvent("vetra:toast", { detail }));
}

describe("ToastHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing before a valid toast event", () => {
    render(<ToastHost />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    dispatchToast({ body: "Missing title" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders title-only and title-plus-body notifications with polite atomic semantics", () => {
    render(<ToastHost />);
    dispatchToast({ title: "Saved" });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saved");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveClass("pointer-events-none");
    expect(screen.queryByText("Details")).not.toBeInTheDocument();

    dispatchToast({ title: "Updated", body: "Your profile is ready." });
    expect(screen.getByRole("status")).toHaveTextContent("Updated");
    expect(screen.getByRole("status")).toHaveTextContent("Your profile is ready.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("dismisses using the default and custom durations", async () => {
    render(<ToastHost />);
    dispatchToast({ title: "Default" });
    await act(async () => { vi.advanceTimersByTime(3999); });
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    dispatchToast({ title: "Custom", durationMs: 750 });
    await act(async () => { vi.advanceTimersByTime(749); });
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("replaces toasts and prevents an old timeout from dismissing the replacement", async () => {
    render(<ToastHost />);
    dispatchToast({ title: "First", durationMs: 100 });
    await act(async () => { vi.advanceTimersByTime(50); });
    dispatchToast({ title: "Second", durationMs: 200 });
    await act(async () => { vi.advanceTimersByTime(60); });
    expect(screen.getByRole("status")).toHaveTextContent("Second");
    await act(async () => { vi.advanceTimersByTime(139); });
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("cleans up its listener and active timer on unmount", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const { unmount } = render(<ToastHost />);
    dispatchToast({ title: "Temporary" });
    unmount();
    expect(removeListener).toHaveBeenCalledWith("vetra:toast", expect.any(Function));
    expect(clearTimeout).toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    removeListener.mockRestore();
    clearTimeout.mockRestore();
  });

  it("does not render the former decorative primary strip", () => {
    const { container } = render(<ToastHost />);
    dispatchToast({ title: "Quiet notice" });
    expect(container.querySelector(".bg-primary")).not.toBeInTheDocument();
    expect(container.querySelector(".w-1")).not.toBeInTheDocument();
  });
});
