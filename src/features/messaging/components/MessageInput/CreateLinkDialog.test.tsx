import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import "@/styles.css";
import { CreateLinkDialog } from "./CreateLinkDialog";

describe("CreateLinkDialog URL field", () => {
  it("keeps the focused input free of a field-sized focus decoration", () => {
    render(
      <CreateLinkDialog
        selectedText="Open site"
        url="example.com"
        invalid={false}
        allowEmpty={false}
        onUrlChange={() => {}}
        onCancel={() => {}}
        onCreate={() => {}}
      />,
    );

    const dialog = screen.getByTestId("create-link-dialog");
    const input = screen.getByTestId("create-link-url-input");
    const underline = screen.getByTestId("create-link-url-underline");
    input.focus();

    expect(input).toHaveFocus();
    expect(input).toHaveClass("vt-create-link-url-input");
    expect(underline).toHaveClass("vt-create-link-url-underline");
    expect(dialog).toHaveClass("vt-create-link-dialog");
  });
});
