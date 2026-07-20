export type CallRuntimeMode = "legacy" | "persistent" | "disabled";

const invalidModeWarnings = new Set<string>();

export function parseCallRuntimeMode(value: unknown = import.meta.env.VITE_CALL_RUNTIME_MODE): CallRuntimeMode {
  if (value === undefined || value === null || value === "") return "legacy";
  if (value === "legacy") return "legacy";
  if (value === "persistent") return "persistent";

  const diagnostic = String(value);
  if (import.meta.env.DEV && !invalidModeWarnings.has(diagnostic)) {
    invalidModeWarnings.add(diagnostic);
    console.warn("[call-runtime] invalid VITE_CALL_RUNTIME_MODE; call runtime disabled");
  }
  return "disabled";
}
