import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { MessageReactions } from "./MessageReactions";

describe("MessageReactions", () => {
  it("renders nothing for an empty reaction list", () => {
    const { container } = render(<MessageReactions messageId={1} reactions={[]} onToggle={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders accessible chosen and unchosen pills in server order", () => {
    const onToggle = vi.fn();
    render(
      <MessageReactions
        messageId={7}
        reactions={[
          { reaction: "👍", count: 4, chosen: true },
          { reaction: "❤️", count: 2, chosen: false },
        ]}
        onToggle={onToggle}
      />,
    );

    const group = screen.getByRole("group", { name: "Message reactions" });
    const buttons = screen.getAllByRole("button");
    expect(group).toContainElement(buttons[0]);
    expect(buttons[0]).toHaveAttribute("type", "button");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[0]).toHaveAttribute("aria-label", "Remove 👍 reaction, 4 reactions");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[1]).toHaveAttribute("aria-label", "Add ❤️ reaction, 2 reactions");
    fireEvent.click(buttons[1]);
    expect(onToggle).toHaveBeenCalledWith("❤️");
  });

  it("matches the captured reaction geometry and keeps metadata as the final child", () => {
    render(
      <MessageReactions
        messageId={8}
        reactions={[{ reaction: "👍", count: 1, chosen: false }]}
        onToggle={vi.fn()}
        metadata={<span data-testid="reaction-metadata">meta</span>}
      />,
    );

    const group = screen.getByTestId("message-reactions");
    const button = screen.getByRole("button");
    const wrapper = group.querySelector(".message-reactions__emoji-wrapper") as HTMLElement;
    const count = group.querySelector(".message-reactions__count") as HTMLElement;
    const metadata = screen.getByTestId("reaction-metadata");

    expect(group).toHaveClass("message-reactions");
    expect(button).toHaveClass("message-reactions__pill");
    expect(button).not.toHaveClass("is-chosen");
    expect(wrapper).toHaveClass("message-reactions__emoji-wrapper");
    expect(count).toHaveClass("message-reactions__count");
    expect(group.lastElementChild).toBe(metadata);
  });
});
