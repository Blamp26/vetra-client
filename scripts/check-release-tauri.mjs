import { applyBuildEnv, loadSmokeEnv, npmExecutable, runCommand } from "./shared.mjs";
import { resolveReleaseBuildEnv } from "./release-call-runtime.mjs";

const env = resolveReleaseBuildEnv(applyBuildEnv(loadSmokeEnv()));
const npm = npmExecutable();

console.log(`Call runtime for Tauri release check: ${env.VITE_CALL_RUNTIME_MODE}`);

await runCommand(npm, ["run", "check:release"], {
  env,
  label: "npm run check:release",
});

await runCommand(npm, ["run", "tauri", "--", "build"], {
  env,
  label: "npm run tauri -- build",
});
