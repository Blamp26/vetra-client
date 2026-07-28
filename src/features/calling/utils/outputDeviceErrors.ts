export function isMissingOutputDeviceError(error: unknown): boolean {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return false;
  }

  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message).toLowerCase() : "";

  return (
    name === "NotFoundError" ||
    name === "NotSupportedError" ||
    message.includes("can not be found here") ||
    message.includes("cannot be found here") ||
    message.includes("object can not be found") ||
    message.includes("object cannot be found") ||
    message.includes("not found")
  );
}

export function isOutputDeviceSecurityError(error: unknown): boolean {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return false;
  }

  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message).toLowerCase() : "";

  return (
    name === "SecurityError" ||
    name === "NotAllowedError" ||
    message.includes("insecure") ||
    message.includes("permission denied") ||
    message.includes("not allowed")
  );
}
