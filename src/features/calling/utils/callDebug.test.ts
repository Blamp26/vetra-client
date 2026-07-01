import { describe, expect, it } from 'vitest';
import { isCallDebugEnabled } from './callDebug';

describe('callDebug', () => {
  it('returns false when localStorage access throws SecurityError', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });

      expect(isCallDebugEnabled()).toBe(false);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });
});
