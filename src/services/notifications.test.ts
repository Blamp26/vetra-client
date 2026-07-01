import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isPermissionGrantedMock,
  requestPermissionMock,
  sendNotificationMock,
} = vi.hoisted(() => ({
  isPermissionGrantedMock: vi.fn(),
  requestPermissionMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
  sendNotification: sendNotificationMock,
}));

import {
  ensureNotificationPermission,
  getNotificationPermissionStatus,
  requestNotificationPermission,
  showNotification,
} from './notifications';

describe('notifications service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  });

  it('does not request browser notification permission without an explicit request', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    Object.defineProperty(window, 'Notification', {
      value: {
        permission: 'default',
        requestPermission,
      },
      configurable: true,
      writable: true,
    });

    await expect(ensureNotificationPermission({ requestIfNeeded: false })).resolves.toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('requests browser notification permission only when explicitly asked', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    Object.defineProperty(window, 'Notification', {
      value: {
        permission: 'default',
        requestPermission,
      },
      configurable: true,
      writable: true,
    });

    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('handles browser notification SecurityError without throwing', async () => {
    const requestPermission = vi
      .fn()
      .mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'));

    Object.defineProperty(window, 'Notification', {
      value: {
        permission: 'default',
        requestPermission,
      },
      configurable: true,
      writable: true,
    });

    await expect(requestNotificationPermission()).resolves.toBe(false);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('returns the current browser notification permission status', async () => {
    Object.defineProperty(window, 'Notification', {
      value: {
        permission: 'denied',
        requestPermission: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    await expect(getNotificationPermissionStatus()).resolves.toBe('denied');
  });

  it('skips showing browser notifications when permission is not granted', async () => {
    const notificationConstructor = vi.fn();
    Object.defineProperty(window, 'Notification', {
      value: Object.assign(notificationConstructor, {
        permission: 'default',
        requestPermission: vi.fn(),
      }),
      configurable: true,
      writable: true,
    });

    await showNotification('Test');

    expect(notificationConstructor).not.toHaveBeenCalled();
  });

  it('requests tauri notification permission only on explicit request', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    });
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue('granted');

    await expect(ensureNotificationPermission({ requestIfNeeded: false })).resolves.toBe(false);
    expect(requestPermissionMock).not.toHaveBeenCalled();

    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
  });

  it('sends tauri notifications only when already granted', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    });
    isPermissionGrantedMock.mockResolvedValue(true);

    await showNotification('Test', { body: 'Body' });

    expect(sendNotificationMock).toHaveBeenCalledWith({ title: 'Test', body: 'Body', icon: undefined });
  });
});
