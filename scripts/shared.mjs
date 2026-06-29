import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseEnvFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1).trim());
    values[key] = value;
  }

  return values;
}

export function loadEnvFiles(names, cwd = process.cwd()) {
  const fileEnv = {};

  for (const name of names) {
    const filePath = resolve(cwd, name);
    if (existsSync(filePath)) {
      Object.assign(fileEnv, parseEnvFile(filePath));
    }
  }

  return { ...fileEnv, ...process.env };
}

export function loadSmokeEnv(cwd = process.cwd()) {
  return loadEnvFiles([".env.smoke", ".env.smoke.local"], cwd);
}

export function loadLoadEnv(cwd = process.cwd()) {
  return loadEnvFiles([".env.load", ".env.load.local"], cwd);
}

export function applyBuildEnv(baseEnv) {
  const env = { ...baseEnv };

  if (!env.VITE_API_URL && env.VETRA_SMOKE_API_URL) {
    env.VITE_API_URL = env.VETRA_SMOKE_API_URL;
  }

  if (!env.VITE_SOCKET_URL && env.VETRA_SMOKE_SOCKET_URL) {
    env.VITE_SOCKET_URL = env.VETRA_SMOKE_SOCKET_URL;
  }

  return env;
}

export function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export async function runCommand(command, args, options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    label = [command, ...args].join(" "),
  } = options;

  await new Promise((resolvePromise, rejectPromise) => {
    const isWindowsCmd =
      process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: isWindowsCmd,
    });

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          signal
            ? `${label} terminated by signal ${signal}`
            : `${label} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}
