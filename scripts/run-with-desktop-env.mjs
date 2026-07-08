import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseEnvFile } from "./shared.mjs";

const DEFAULT_DESKTOP_API_URL = "http://146.120.249.160/api/v1";
const DEFAULT_DESKTOP_SOCKET_URL = "ws://146.120.249.160/socket";
const DESKTOP_ENV_FILES = [".env", ".env.local"];

export function resolveDesktopEnv(baseEnv = process.env, cwd = process.cwd()) {
  const fileEnv = {};

  for (const name of DESKTOP_ENV_FILES) {
    const filePath = resolve(cwd, name);
    if (existsSync(filePath)) {
      Object.assign(fileEnv, parseEnvFile(filePath));
    }
  }

  const env = {
    ...fileEnv,
    ...baseEnv,
  };

  // Default to the public URL for external and production-like desktop access.
  // LAN development can override this in .env.local or the shell environment.
  // Using the public IP from the same LAN also depends on router hairpin NAT.
  if (!env.VITE_API_URL) {
    env.VITE_API_URL = DEFAULT_DESKTOP_API_URL;
  }

  if (!env.VITE_SOCKET_URL) {
    env.VITE_SOCKET_URL = DEFAULT_DESKTOP_SOCKET_URL;
  }

  return env;
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  if (!command) {
    console.error("Usage: node scripts/run-with-desktop-env.mjs <command> [args...]");
    process.exit(1);
  }

  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: resolveDesktopEnv(),
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}
