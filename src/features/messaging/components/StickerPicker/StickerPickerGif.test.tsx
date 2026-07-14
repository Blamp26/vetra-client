import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, savedMock, searchMock, getByIdsMock, sendMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  savedMock: vi.fn(),
  searchMock: vi.fn(),
  getByIdsMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("@/api/stickers", () => ({ stickersApi: { list: listMock } }));
vi.mock("@/api/gifs", () => ({ gifsApi: { saved: savedMock } }));
vi.mock("@/api/giphy", () => ({
  giphyApi: {
    isConfigured: () => true,
    search: searchMock,
    trending: vi.fn(),
    getByIds: getByIdsMock,
    customerId: vi.fn().mockResolvedValue("customer"),
    analytics: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/api/base", () => ({ API_BASE_URL: "", postFormData: vi.fn() }));
vi.mock("@/store", () => ({ useAppStore: (selector: (state: unknown) => unknown) => selector({ currentUser: { id: 7 }, authToken: "token" }) }));

import { StickerPicker } from "./StickerPicker";

const result = (providerId: string) => ({
  provider: "giphy" as const,
  providerId,
  title: providerId,
  width: 480,
  height: 270,
  previewMp4Url: null,
  previewWebpUrl: null,
  previewStillUrl: null,
  messageMp4Url: null,
  messageWebpUrl: null,
  analytics: {},
});

describe("StickerPicker GIF result state", () => {
  beforeEach(() => {
    listMock.mockResolvedValue([]);
    savedMock.mockResolvedValue([]);
    getByIdsMock.mockResolvedValue([]);
    searchMock.mockReset();
    sendMock.mockReset();
  });

  it("keeps the active search results after a successful send and refreshes Recent separately", async () => {
    searchMock.mockResolvedValue({ results: [result("cat-1"), result("cat-2")], hasMore: false });
    sendMock.mockResolvedValue(undefined);
    render(<StickerPicker onSend={vi.fn()} onSendGif={sendMock} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "GIFs" }));
    const input = screen.getByRole("textbox", { name: "Search GIFs" });
    fireEvent.change(input, { target: { value: "cat" } });

    await waitFor(() => expect(screen.getByRole("button", { name: "cat-1" })).toBeInTheDocument(), { timeout: 1000 });
    fireEvent.click(screen.getByRole("button", { name: "cat-1" }));

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("cat");
    expect(screen.getByRole("button", { name: "cat-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cat-2" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Clear GIF search"));
    await waitFor(() => expect(screen.getByText("No saved GIFs")).toBeInTheDocument());
    expect(savedMock).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId("sticker-picker")).getByRole("button", { name: "Recent" })).toHaveClass("bg-primary\/20");
  });
});
