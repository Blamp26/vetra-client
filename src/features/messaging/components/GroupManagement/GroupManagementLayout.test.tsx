import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import {
  GroupManagementFooter,
  GroupManagementBooleanControl,
  GroupManagementFrame,
  GroupManagementHeader,
  GroupManagementControlRow,
  GroupManagementPersonRow,
  GroupManagementRow,
  GroupManagementScrollBody,
  GroupManagementSubpage,
} from "./GroupManagementLayout";

describe("GroupManagementLayout", () => {
  it.each([
    ["profile", "max-w-[392px]"],
    ["settings", "max-w-[366px]"],
  ] as const)("provides the shared %s frame", (width, widthClass) => {
    render(
      <GroupManagementFrame width={width} labelledBy={`${width}-title`} onClose={vi.fn()}>
        <GroupManagementHeader
          title={width}
          titleId={`${width}-title`}
          closeLabel={`Close ${width}`}
          onClose={vi.fn()}
        />
        <GroupManagementScrollBody>Body</GroupManagementScrollBody>
        <GroupManagementFooter>Footer</GroupManagementFooter>
      </GroupManagementFrame>,
    );

    expect(screen.getByTestId("group-management-frame")).toHaveAttribute(
      "data-group-management-frame",
      width,
    );
    expect(screen.getByTestId("dialog-panel")).toHaveClass(widthClass, "overflow-hidden");
    expect(screen.getByText("Body")).toHaveClass("overflow-y-auto", "min-h-0");
    expect(screen.getByText("Footer")).toHaveClass("min-h-14", "shrink-0");
  });

  it("renders a full-hit-target destructive row with stable slots", () => {
    render(
      <GroupManagementRow
        label="Delete group"
        secondary="Cannot be undone"
        leading={<span>icon</span>}
        trailing={<span>value</span>}
        tone="destructive"
      />,
    );
    expect(screen.getByRole("button", { name: /Delete group/ })).toHaveClass(
      "min-h-11",
      "px-5",
      "text-destructive",
    );
  });

  it("supports a local viewport-safe frame minimum without changing the shared maximum", () => {
    render(
      <GroupManagementFrame
        width="settings"
        labelledBy="settings-title"
        onClose={vi.fn()}
        contentClassName="min-h-[min(520px,calc(100dvh-96px))]"
      >
        <GroupManagementHeader title="Members" titleId="settings-title" closeLabel="Close" onClose={vi.fn()} />
      </GroupManagementFrame>,
    );

    expect(screen.getByTestId("group-management-frame")).toHaveClass(
      "min-h-[min(520px,calc(100dvh-96px))]",
      "max-h-[calc(100dvh-96px)]",
    );
  });

  it("provides shared inset, person, and control geometry for governance subpages", () => {
    render(
      <GroupManagementSubpage data-testid="subpage">
        <GroupManagementPersonRow
          name="Ada Administrator"
          secondary="Administrator"
          onClick={vi.fn()}
        />
        <GroupManagementControlRow
          label="Send messages"
          htmlFor="send-messages"
          control={<GroupManagementBooleanControl id="send-messages" checked={false} onChange={vi.fn()} />}
        />
      </GroupManagementSubpage>,
    );

    expect(screen.getByTestId("subpage")).toHaveClass("px-5", "pt-4", "pb-5", "space-y-3");
    expect(screen.getByRole("button", { name: "Ada Administrator Administrator" })).toHaveClass(
      "min-h-14",
      "gap-3",
      "px-3",
    );
    expect(screen.getByText("Ada Administrator").closest("button")?.querySelector('[data-slot="avatar"]')).toHaveClass("h-10", "w-10");
    expect(screen.getByText("Send messages").closest("label")).toHaveClass("min-h-11", "px-3");
    expect(screen.getByRole("checkbox", { name: "Send messages" })).toHaveClass("sr-only", "peer");
    expect(screen.getByTestId("subpage").querySelector('[data-group-management-boolean-control="unchecked"]')).toHaveClass(
      "border-border",
      "bg-background",
      "peer-focus-visible:ring-2",
    );
  });

  it("keeps native checkbox and full-row toggle semantics", () => {
    const onChange = vi.fn();
    render(
      <GroupManagementControlRow
        label="Delete messages"
        htmlFor="delete-messages"
        control={<GroupManagementBooleanControl id="delete-messages" checked disabled={false} onChange={onChange} />}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Delete messages" });
    expect(checkbox).toBeChecked();
    expect(screen.getByText("Delete messages").closest("label")).toHaveClass("cursor-pointer");
    fireEvent.click(screen.getByText("Delete messages"));
    expect(onChange).toHaveBeenCalledOnce();
  });
});
