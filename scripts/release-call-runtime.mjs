export function resolveReleaseCallRuntimeMode(rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  if (value === undefined || value === null || value === "") return "persistent";
  if (value === "persistent") return value;

  throw new Error(`Invalid VITE_CALL_RUNTIME_MODE for release build: ${JSON.stringify(value)}`);
}

export function resolveReleaseBuildEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    VITE_CALL_RUNTIME_MODE: resolveReleaseCallRuntimeMode(baseEnv.VITE_CALL_RUNTIME_MODE),
  };
}
