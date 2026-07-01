const CALL_DEBUG_KEY = 'vetra.debug.calls';

export function isCallDebugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(CALL_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function debugCall(message: string, details?: Record<string, unknown>): void {
  if (!isCallDebugEnabled()) return;
  console.log(message, details ?? {});
}
