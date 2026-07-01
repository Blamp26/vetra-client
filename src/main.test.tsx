import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createRootMock,
  renderMock,
  getStringMock,
  removeMock,
} = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  renderMock: vi.fn(),
  getStringMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: createRootMock,
  },
  createRoot: createRootMock,
}));

vi.mock('./App', () => ({
  default: () => null,
}));

vi.mock('@/shared/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/shared/utils/storage', () => ({
  storage: {
    getString: getStringMock,
    remove: removeMock,
  },
  STORAGE_KEYS: {
    THEME: 'theme',
  },
}));

describe('main startup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getStringMock.mockReturnValue('light');
    createRootMock.mockReturnValue({ render: renderMock });
    document.documentElement.classList.remove('dark');
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('does not request notification permission on app load', async () => {
    const requestPermission = vi.fn();

    Object.defineProperty(window, 'Notification', {
      value: {
        permission: 'default',
        requestPermission,
      },
      configurable: true,
      writable: true,
    });

    await import('./main');

    expect(requestPermission).not.toHaveBeenCalled();
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
