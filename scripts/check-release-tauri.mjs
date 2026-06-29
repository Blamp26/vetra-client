import { applyBuildEnv, loadSmokeEnv, npmExecutable, runCommand } from "./shared.mjs";

const env = applyBuildEnv(loadSmokeEnv());
const npm = npmExecutable();

await runCommand(npm, ["run", "check:release"], {
  env,
  label: "npm run check:release",
});

await runCommand(npm, ["run", "tauri", "build"], {
  env,
  label: "npm run tauri build",
});
