import { applyBuildEnv, loadSmokeEnv, npmExecutable, runCommand } from "./shared.mjs";
import { resolveReleaseBuildEnv } from "./release-call-runtime.mjs";

const env = resolveReleaseBuildEnv(applyBuildEnv(loadSmokeEnv()));
const npm = npmExecutable();

console.log(`Call runtime for release check: ${env.VITE_CALL_RUNTIME_MODE}`);

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
