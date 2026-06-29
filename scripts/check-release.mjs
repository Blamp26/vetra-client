import { applyBuildEnv, loadSmokeEnv, npmExecutable, runCommand } from "./shared.mjs";

const env = applyBuildEnv(loadSmokeEnv());
const npm = npmExecutable();

await runCommand(npm, ["exec", "--", "tsc", "--noEmit"], {
  env,
  label: "npm exec -- tsc --noEmit",
});

await runCommand(npm, ["exec", "--", "vitest", "run"], {
  env,
  label: "npm exec -- vitest run",
});

await runCommand(npm, ["run", "build"], {
  env,
  label: "npm run build",
});

await runCommand(npm, ["run", "smoke:lan"], {
  env,
  label: "npm run smoke:lan",
});
