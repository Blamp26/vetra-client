import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import {
  GroupManagementFooter,
  GroupManagementFrame,
  GroupManagementHeader,
  GroupManagementRow,
  GroupManagementScrollBody,
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
});
