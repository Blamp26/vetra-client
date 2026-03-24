import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    try {
      const granted = await isPermissionGranted();
      console.log('[Notifications] isPermissionGranted:', granted);

      if (!granted) {
        const permission = await requestPermission();
        console.log('[Notifications] requestPermission result:', permission);
        return permission === 'granted';
      }
      return true;
    } catch (e) {
      console.error('[Notifications] Tauri permission check failed:', e);
      return false;
    }
  }

  if (!('Notification' in window)) {
    console.warn('[Notifications] Browser does not support notifications');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
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
    const granted = await ensureNotificationPermission();
    if (!granted) {
      console.warn('[Notifications] Permission not granted');
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
