import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { npmExecutable, runCommand } from "./shared.mjs";
import { resolveReleaseBuildEnv } from "./release-call-runtime.mjs";

export async function runReleaseBuild({
  baseEnv = process.env,
  run = runCommand,
} = {}) {
  const env = resolveReleaseBuildEnv(baseEnv);
  console.log(`Call runtime for release build: ${env.VITE_CALL_RUNTIME_MODE}`);
  const npm = npmExecutable();

  await run(npm, ["exec", "--", "tsc"], {
    env,
    label: "npm exec -- tsc",
  });
  await run(npm, ["exec", "--", "vite", "build"], {
    env,
    label: "npm exec -- vite build",
  });
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runReleaseBuild().catch((error) => {
    console.error(error instanceof Error ? error.message : "Release build failed");
    process.exitCode = 1;
  });
}
