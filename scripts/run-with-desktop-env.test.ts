import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveDesktopEnv } from "./run-with-desktop-env.mjs";

describe("resolveDesktopEnv", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((dir) => {
      rmSync(dir, { recursive: true, force: true });
    });
  });

  it("keeps explicit shell env overrides", () => {
    const cwd = mkdtempSync(join(tmpdir(), "vetra-desktop-env-"));
    tempDirs.push(cwd);

    writeFileSync(
      join(cwd, ".env.local"),
      [
        "VITE_API_URL=http://192.168.88.26:4000/api/v1",
        "VITE_SOCKET_URL=ws://192.168.88.26:4000/socket",
      ].join("\n"),
    );

    const env = resolveDesktopEnv(
      {
        VITE_API_URL: "http://localhost:4000/api/v1",
        VITE_SOCKET_URL: "ws://localhost:4000/socket",
      },
      cwd,
    );

    expect(env.VITE_API_URL).toBe("http://localhost:4000/api/v1");
    expect(env.VITE_SOCKET_URL).toBe("ws://localhost:4000/socket");
  });

  it("uses .env.local values when the shell does not provide overrides", () => {
    const cwd = mkdtempSync(join(tmpdir(), "vetra-desktop-env-"));
    tempDirs.push(cwd);

    writeFileSync(
      join(cwd, ".env.local"),
      [
        "VITE_API_URL=http://192.168.88.26:4000/api/v1",
        "VITE_SOCKET_URL=ws://192.168.88.26:4000/socket",
      ].join("\n"),
    );

    const env = resolveDesktopEnv({}, cwd);

    expect(env.VITE_API_URL).toBe("http://192.168.88.26:4000/api/v1");
    expect(env.VITE_SOCKET_URL).toBe("ws://192.168.88.26:4000/socket");
  });

  it("falls back to the public desktop defaults when nothing is configured", () => {
    const cwd = mkdtempSync(join(tmpdir(), "vetra-desktop-env-"));
    tempDirs.push(cwd);

    const env = resolveDesktopEnv({}, cwd);

    expect(env.VITE_API_URL).toBe("http://146.120.249.160/api/v1");
    expect(env.VITE_SOCKET_URL).toBe("ws://146.120.249.160/socket");
  });
});
