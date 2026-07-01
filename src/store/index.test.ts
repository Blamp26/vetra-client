import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('store startup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not crash when localStorage access throws SecurityError', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });

      const store = await import('./index');

      expect(store.getState()).toBeDefined();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });
});
