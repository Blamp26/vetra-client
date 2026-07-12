import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageContextMenu, calculateContextMenuPosition, type Rect } from "./MessageContextMenu";

function menuRect(position: { left: number; top: number }, width = 216, height = 248): Rect {
  return {
    left: position.left,
    top: position.top,
    right: position.left + width,
    bottom: position.top + height,
    width,
    height,
  };
}

function popupRect(position: { left: number; top: number }, width = 216, height = 248): Rect {
  return {
    left: position.left - 82,
    top: position.top - 48,
    right: position.left - 82 + Math.max(width + 82, 298),
    bottom: position.top - 48 + height + 48,
    width: Math.max(width + 82, 298),
    height: height + 48,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe("MessageContextMenu", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 248,
      right: 216,
      width: 216,
      height: 248,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  function renderMenu(
    dataOverrides: Partial<Parameters<typeof MessageContextMenu>[0]["data"]> = {},
    propOverrides: Partial<Omit<Parameters<typeof MessageContextMenu>[0], "data">> = {},
  ) {
    render(
      <MessageContextMenu
        data={{
          msgId: 1,
          content: "Hello",
          x: 160,
          y: 220,
          isOwn: true,
          hasText: true,
          hasAttachment: false,
          author: "Alice",
          ...dataOverrides,
        }}
        isPickerExpanded={false}
        setIsPickerExpanded={vi.fn()}
        onToggleReaction={vi.fn()}
        onReply={vi.fn()}
        onCopy={vi.fn()}
        onDownload={vi.fn()}
        onForward={vi.fn()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        canReply={true}
        canEdit={true}
        canForward={true}
        canDownload={false}
        onClose={vi.fn()}
        {...propOverrides}
      />,
    );
  }

  it("keeps a normal click position when there is room in the viewport", () => {
    renderMenu({ x: 120, y: 140 });

    expect(screen.getByTestId("message-context-menu")).toHaveStyle({
      left: "120px",
      top: "140px",
    });
  });

  it("keeps the outgoing message popup off the message text while staying near the bubble", () => {
    const contentRect = {
      left: 720,
      top: 140,
      right: 900,
      bottom: 220,
      width: 180,
      height: 80,
    };
    const position = calculateContextMenuPosition({
      x: 900,
      y: 160,
      menuWidth: 216,
      menuHeight: 248,
      viewportWidth: 1000,
      viewportHeight: 800,
      contentRect,
      isOwn: true,
    });

    expect(position.left).toBe(496);
    expect(intersects(popupRect(position), contentRect)).toBe(false);
  });

  it("keeps the incoming message popup off the message text while staying near the bubble", () => {
    const contentRect = {
      left: 100,
      top: 180,
      right: 320,
      bottom: 260,
      width: 220,
      height: 80,
    };
    const position = calculateContextMenuPosition({
      x: 120,
      y: 200,
      menuWidth: 216,
      menuHeight: 248,
      viewportWidth: 1000,
      viewportHeight: 800,
      contentRect,
      isOwn: false,
    });

    expect(position.left).toBe(410);
    expect(intersects(popupRect(position), contentRect)).toBe(false);
  });

  it("shifts the popup fully outside the clicked bubble rect with a small gap", () => {
    const bubbleRect = {
      left: 660,
      top: 220,
      right: 940,
      bottom: 320,
      width: 280,
      height: 100,
    };
    const position = calculateContextMenuPosition({
      x: 900,
      y: 260,
      menuWidth: 216,
      menuHeight: 248,
      viewportWidth: 1200,
      viewportHeight: 900,
      bubbleRect,
      contentRect: {
        left: 688,
        top: 232,
        right: 920,
        bottom: 300,
        width: 232,
        height: 68,
      },
      isOwn: true,
    });

    expect(intersects(popupRect(position), bubbleRect)).toBe(false);
    expect(position.left + 216).toBeLessThanOrEqual(bubbleRect.left - 8);
  });

  it("keeps the full popup inside the viewport near the bottom edge", () => {
    const position = calculateContextMenuPosition({
      x: 980,
      y: 780,
      menuWidth: 216,
      menuHeight: 248,
      viewportWidth: 1000,
      viewportHeight: 800,
      contentRect: {
        left: 760,
        top: 720,
        right: 940,
        bottom: 780,
        width: 180,
        height: 60,
      },
      isOwn: true,
    });

    expect(position.left).toBeGreaterThanOrEqual(90);
    expect(position.top).toBeGreaterThanOrEqual(56);
    expect(position.left + 216).toBeLessThanOrEqual(992);
    expect(position.top + 248).toBeLessThanOrEqual(792);
  });

  it("renders the floating reaction strip with the expected emojis", () => {
    renderMenu();

    expect(screen.getByTestId("message-context-reactions")).toBeInTheDocument();
    expect(screen.getByTestId("message-context-reactions")).toHaveClass("left-[-82px]");
    expect(screen.getByTestId("message-context-reactions")).toHaveClass("w-[298px]");
    expect(screen.getByTestId("message-context-reactions")).toHaveClass("top-[-48px]");
    expect(screen.getByTestId("message-context-reactions-surface")).toHaveClass("rounded-[20px]");
    expect(screen.getAllByTestId("message-context-reaction-button")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "React with 👍" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "React with 🔥" })).toBeInTheDocument();
    expect(screen.queryByTestId("message-context-reaction-tail-large")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-context-reaction-tail-small")).not.toBeInTheDocument();
  });

  it("renders a down arrow button instead of the three-dots more glyph", () => {
    renderMenu();

    const button = screen.getByTestId("message-context-reaction-more");
    expect(button.querySelector("svg")).toHaveClass("lucide-chevron-down");
    expect(button.querySelector("svg")).not.toHaveClass("lucide-ellipsis");
  });

  it("toggles the expanded reactions picker from the down arrow", () => {
    function Wrapper() {
      const [expanded, setExpanded] = React.useState(false);
      return (
        <MessageContextMenu
          data={{
            msgId: 1,
            content: "Hello",
            x: 160,
            y: 220,
            isOwn: true,
            hasText: true,
            hasAttachment: false,
            author: "Alice",
          }}
          isPickerExpanded={expanded}
          setIsPickerExpanded={setExpanded}
          onToggleReaction={vi.fn()}
          onReply={vi.fn()}
          onCopy={vi.fn()}
          onDownload={vi.fn()}
          onForward={vi.fn()}
          onSelect={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          canReply={true}
          canEdit={true}
          canForward={true}
          canDownload={false}
          onClose={vi.fn()}
        />
      );
    }

    render(<Wrapper />);

    const button = screen.getByTestId("message-context-reaction-more");
    expect(screen.queryByTestId("message-context-expanded-picker")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByTestId("message-context-expanded-picker")).toBeInTheDocument();
    expect(screen.getByTestId("message-context-reactions")).toHaveClass("top-[-48px]");
    expect(screen.getByTestId("message-context-reactions")).toHaveClass("w-[298px]");
    expect(screen.getByTestId("message-context-expanded-picker")).toHaveClass("w-[298px]");
    expect(screen.queryByTestId("message-context-reactions-surface")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-context-reaction-more")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-context-expanded-picker-search")).toBeInTheDocument();
  });

  it("uses a transparent 216px anchor with a narrower visible action surface", () => {
    renderMenu();

    expect(screen.getByTestId("message-context-menu")).toHaveClass("w-[216px]");
    expect(screen.getByTestId("message-context-menu")).toHaveClass("min-w-[216px]");
    expect(screen.getByTestId("message-context-surface")).toHaveClass("w-[172px]");
    expect(screen.getByTestId("message-context-surface")).toHaveClass("mr-[44px]");
    expect(screen.getByTestId("message-context-surface")).toHaveClass("rounded-[16px]");
  });

  it("renders compact 32px action rows with Telegram-like icon spacing", () => {
    renderMenu();

    const reply = screen.getByTestId("message-context-action-reply");
    expect(reply).toHaveClass("h-8");
    expect(reply).toHaveClass("w-[164px]");
    expect(reply).toHaveClass("rounded-[6px]");
    expect(reply.querySelector("svg")).toHaveClass("h-5", "w-5", "ml-2", "mr-5");
  });

  it("calls reply when available", () => {
    const onReply = vi.fn();
    const onClose = vi.fn();
    renderMenu({}, { onReply, onClose });

    fireEvent.click(screen.getByRole("menuitem", { name: "Reply" }));

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides Copy Text for media-only messages", () => {
    renderMenu({ content: null, hasText: false });

    expect(screen.queryByRole("menuitem", { name: "Copy Text" })).not.toBeInTheDocument();
  });

  it("renders download for attachment messages and calls the existing download handler", () => {
    const onDownload = vi.fn();
    const onClose = vi.fn();
    renderMenu({ hasAttachment: true }, { canDownload: true, onDownload, onClose });

    fireEvent.click(screen.getByRole("menuitem", { name: "Download" }));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("allows forwarding attachment messages", () => {
    const onForward = vi.fn();
    renderMenu({ hasAttachment: true }, { canEdit: false, canForward: true, onForward });

    fireEvent.click(screen.getByRole("menuitem", { name: "Forward" }));

    expect(onForward).toHaveBeenCalledTimes(1);
  });

  it("renders delete as the destructive bottom action and only fires when available", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    renderMenu({}, { onDelete, onClose });

    const button = screen.getByRole("menuitem", { name: "Delete" });
    expect(button).toHaveClass("text-[#e53935]");

    fireEvent.click(button);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and scroll", () => {
    const onClose = vi.fn();
    renderMenu({}, { onClose });

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.scroll(window);

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps Escape closing the popup while the expanded picker is open", () => {
    const onClose = vi.fn();
    renderMenu({}, { isPickerExpanded: true, onClose });

    expect(screen.getByTestId("message-context-expanded-picker")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when scrolling inside the expanded picker grid", () => {
    const onClose = vi.fn();
    renderMenu({}, { isPickerExpanded: true, onClose });

    fireEvent.scroll(screen.getByTestId("message-context-expanded-picker-grid"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the chevron only in the collapsed quick strip", () => {
    renderMenu({}, { isPickerExpanded: true });

    expect(screen.queryByTestId("message-context-reaction-more")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-context-expanded-picker")).toBeInTheDocument();
  });

  it("renders a Search input in expanded state without category controls", () => {
    renderMenu({}, { isPickerExpanded: true });

    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.queryByTestId("message-context-expanded-picker-rail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-context-expanded-picker-rail-button")).not.toBeInTheDocument();
  });

  it("filters emoji results from the search input and restores them when cleared", () => {
    renderMenu({}, { isPickerExpanded: true });

    const input = screen.getByTestId("message-context-expanded-picker-search");
    const initialCount = screen.getAllByTestId("message-context-expanded-picker-button").length;
    expect(initialCount).toBeGreaterThan(10);

    fireEvent.change(input, { target: { value: "banana" } });
    let filtered = screen.getAllByTestId("message-context-expanded-picker-button");
    expect(filtered).toHaveLength(1);
    expect(screen.getByRole("button", { name: "React with 🍌" })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    filtered = screen.getAllByTestId("message-context-expanded-picker-button");
    expect(filtered).toHaveLength(initialCount);
  });

  it("renders the expanded picker in the reaction layer instead of below the action menu", () => {
    renderMenu({}, { isPickerExpanded: true });

    const picker = screen.getByTestId("message-context-expanded-picker");
    const reactionLayer = screen.getByTestId("message-context-reactions");
    const actionSurface = screen.getByTestId("message-context-surface");

    expect(reactionLayer).toContainElement(picker);
    expect(actionSurface).not.toContainElement(picker);
    expect(reactionLayer).toHaveClass("left-[-82px]");
    expect(reactionLayer).toHaveClass("top-[-48px]");
    expect(reactionLayer).toHaveClass("w-[298px]");
    expect(picker).toHaveClass("w-[298px]");
  });
});
