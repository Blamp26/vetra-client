import {
  isPermissionGranted,
  requestPermission as requestTauriPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export type NotificationPermissionStatus = NotificationPermission | 'unsupported';

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (isTauri()) {
    try {
      const granted = await isPermissionGranted();
      return granted ? 'granted' : 'default';
    } catch (e) {
      console.error('[Notifications] Tauri permission check failed:', e);
      return 'default';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'unsupported';
  }

  try {
    return Notification.permission;
  } catch (e) {
    console.error('[Notifications] Browser permission check failed:', e);
    return 'unsupported';
  }
}

export async function ensureNotificationPermission(options?: {
  requestIfNeeded?: boolean;
}): Promise<boolean> {
  const status = await getNotificationPermissionStatus();
  if (status === 'granted') return true;
  if (status === 'unsupported' || status === 'denied' || !options?.requestIfNeeded) {
    return false;
  }

  if (isTauri()) {
    try {
      const permission = await requestTauriPermission();
      return permission === 'granted';
    } catch (e) {
      console.error('[Notifications] Tauri permission request failed:', e);
      return false;
    }
  }

  try {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      return false;
    }
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    console.error('[Notifications] Browser permission request failed:', e);
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  return ensureNotificationPermission({ requestIfNeeded: true });
}

export async function showNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    onClick?: () => void;
  }
) {
  try {
    const granted = await ensureNotificationPermission({ requestIfNeeded: false });
    if (!granted) {
      return;
    }

    if (isTauri()) {
      sendNotification({ title, body: options?.body, icon: options?.icon });
      return;
    }

    const notification = new Notification(title, {
      body: options?.body,
      icon: options?.icon,
    });
    if (options?.onClick) {
      notification.onclick = options.onClick;
    }
  } catch (e) {
    console.error('[Notifications] showNotification failed:', e);
  }
}
