import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveReleaseBuildEnv, resolveReleaseCallRuntimeMode } from "./release-call-runtime.mjs";
import { runReleaseBuild } from "./run-release-build.mjs";

describe("release call runtime", () => {
  it.each([
    [undefined, "persistent"],
    ["", "persistent"],
    ["   ", "persistent"],
    ["persistent", "persistent"],
  ])("resolves %s to %s", (value, expected) => {
    expect(resolveReleaseCallRuntimeMode(value)).toBe(expected);
  });

  it.each(["legacy", "disabled", "PERSISTENT", "Legacy", "true", "future-mode"])("rejects invalid release mode %s", (value) => {
    expect(() => resolveReleaseCallRuntimeMode(value)).toThrow(`Invalid VITE_CALL_RUNTIME_MODE for release build: ${JSON.stringify(value)}`);
  });

  it("injects only the resolved call runtime and does not mutate the parent environment", () => {
    const baseEnv = { VITE_API_URL: "https://api.example", VITE_SOCKET_URL: "wss://socket.example", PATH: "/usr/bin" };
    const resolved = resolveReleaseBuildEnv(baseEnv);

    expect(resolved).toMatchObject({ ...baseEnv, VITE_CALL_RUNTIME_MODE: "persistent" });
    expect(baseEnv).not.toHaveProperty("VITE_CALL_RUNTIME_MODE");
  });

  it.each([
    [undefined, "persistent"],
  ])("passes %s through the browser/Tauri release build child plan", async (value, expected) => {
    const calls: Array<{ command: string; args: string[]; env: Record<string, string | undefined> }> = [];
    const run = vi.fn(async (command: string, args: string[], options: { env: Record<string, string | undefined> }) => {
      calls.push({ command, args, env: options.env });
    });

    await runReleaseBuild({
      baseEnv: { VITE_API_URL: "https://api.example", VITE_SOCKET_URL: "wss://socket.example", VITE_CALL_RUNTIME_MODE: value },
      run,
    });

    expect(calls).toHaveLength(2);
    expect(calls.every(({ env }) => env.VITE_CALL_RUNTIME_MODE === expected)).toBe(true);
    expect(calls[0].env).toMatchObject({ VITE_API_URL: "https://api.example", VITE_SOCKET_URL: "wss://socket.example" });
    expect(calls.map(({ args }) => args)).toEqual([["exec", "--", "tsc"], ["exec", "--", "vite", "build"]]);
  });

  it.each(["legacy", "disabled"])("rejects %s before spawning either release child", async (value) => {
    const run = vi.fn();
    await expect(runReleaseBuild({ baseEnv: { VITE_CALL_RUNTIME_MODE: value }, run })).rejects.toThrow("Invalid VITE_CALL_RUNTIME_MODE");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects an invalid mode before spawning either build child", async () => {
    const run = vi.fn();

    await expect(runReleaseBuild({ baseEnv: { VITE_CALL_RUNTIME_MODE: "invalid" }, run })).rejects.toThrow("Invalid VITE_CALL_RUNTIME_MODE");
    expect(run).not.toHaveBeenCalled();
  });

  it("wires browser and Tauri production builds through the same release wrapper", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const tauriConfig = JSON.parse(readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8")) as {
      build: { beforeBuildCommand: string; beforeDevCommand: string };
    };

    expect(packageJson.scripts.build).toBe("node scripts/run-release-build.mjs");
    expect(packageJson.scripts["build:desktop-web"]).toContain("npm run build");
    expect(tauriConfig.build.beforeBuildCommand).toBe("npm run build:desktop-web");
    expect(tauriConfig.build.beforeDevCommand).toBe("npm run dev:desktop-web");
  });
});
