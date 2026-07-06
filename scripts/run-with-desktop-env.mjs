import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/run-with-desktop-env.mjs <command> [args...]");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    VITE_API_URL: "http://146.120.249.160/api/v1",
    VITE_SOCKET_URL: "ws://146.120.249.160/socket",
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

