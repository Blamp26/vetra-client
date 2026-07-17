import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { StatusIcon } from "./StatusIcon";

function getPathYCoordinates(path: SVGPathElement) {
  return [...path.getAttribute("d")!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(
    ([, , y]) => y,
  );
}

describe("StatusIcon", () => {
  it("uses matching vertical geometry for both read checks", () => {
    render(<StatusIcon status="read" />);

    const paths = screen.getByLabelText("Read").querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(getPathYCoordinates(paths[0])).toEqual(["9.5", "13", "5.5"]);
    expect(getPathYCoordinates(paths[1])).toEqual(["9.5", "13", "5.5"]);
  });
});
