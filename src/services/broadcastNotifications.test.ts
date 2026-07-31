import { describe, expect, it, vi } from 'vitest';
import { showBroadcastNotification } from './notifications';

describe('broadcast notification delivery', () => {
  it('deduplicates the stable server idempotency key and keeps the immutable link', async () => {
    const created: Array<{ onclick?: () => void }> = [];
    class FakeNotification {
      onclick?: () => void;

      constructor(public title: string) {
        created.push(this);
      }
    }

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: Object.assign(FakeNotification, { permission: 'granted' }),
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.stubGlobal('Notification', Object.assign(FakeNotification, { permission: 'granted' }));
    await showBroadcastNotification({
      idempotency_key: 'notification-dedup-test',
      channel_public_id: 'channel-public',
      publication_public_id: 'publication-public',
    });
    await showBroadcastNotification({
      idempotency_key: 'notification-dedup-test',
      channel_public_id: 'channel-public',
      publication_public_id: 'publication-public',
    });

    expect(created).toHaveLength(1);
    created[0].onclick?.();
    expect(window.location.hash).toBe('#/broadcast/channel-public/publication-public');
  });

  it('does not reconstruct publication content from a minimal notification payload', async () => {
    const created: Array<{ body?: string }> = [];
    class FakeNotification {
      constructor(_title: string, options?: { body?: string }) {
        created.push(options ?? {});
      }
    }

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: Object.assign(FakeNotification, { permission: 'granted' }),
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.stubGlobal('Notification', Object.assign(FakeNotification, { permission: 'granted' }));
    await showBroadcastNotification({
      idempotency_key: 'notification-minimal-payload',
      channel_public_id: 'channel-public',
      publication_public_id: 'publication-public',
      channel_display_name: 'News',
    });

    expect(created).toEqual([{ body: 'New publication' }]);
    expect(JSON.stringify(created)).not.toContain('publication body');
  });

  it('does not create a notification when permission is denied', async () => {
    const created = vi.fn();
    class DeniedNotification {
      constructor() {
        created();
      }
    }

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: Object.assign(DeniedNotification, { permission: 'denied' }),
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.stubGlobal('Notification', Object.assign(DeniedNotification, { permission: 'denied' }));
    await showBroadcastNotification({
      idempotency_key: 'notification-permission-denied',
      channel_public_id: 'channel-public',
    });
    expect(created).not.toHaveBeenCalled();
  });
});
