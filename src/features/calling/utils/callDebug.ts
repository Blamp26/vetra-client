const CALL_DEBUG_KEY = 'vetra.debug.calls';
const CALL_DEBUG_CHANGED_EVENT = 'vetra:call-debug-changed';

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

export function subscribeToCallDebugState(listener: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const notify = () => listener(isCallDebugEnabled());
  window.addEventListener('storage', notify);
  window.addEventListener(CALL_DEBUG_CHANGED_EVENT, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(CALL_DEBUG_CHANGED_EVENT, notify);
  };
}

export function setCallDebugEnabled(enabled: boolean): void {
  try {
    if (enabled) globalThis.localStorage?.setItem(CALL_DEBUG_KEY, '1');
    else globalThis.localStorage?.removeItem(CALL_DEBUG_KEY);
  } catch {
    // The existing debug flag is best-effort in restricted runtimes.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CALL_DEBUG_CHANGED_EVENT));
}
