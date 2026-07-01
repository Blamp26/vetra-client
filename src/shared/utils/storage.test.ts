import { describe, expect, it } from 'vitest';
import { storage } from './storage';

describe('storage', () => {
  it('returns null from getString when localStorage throws SecurityError', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });

      expect(storage.getString('vetra_theme')).toBeNull();
      expect(() => storage.remove('theme')).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });
});
