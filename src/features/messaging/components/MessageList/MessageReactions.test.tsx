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
});
