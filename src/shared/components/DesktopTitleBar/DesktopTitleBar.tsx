import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

type TauriWindowApi = {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  unmaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
};

export const APP_TITLE_BAR_HEIGHT = 32;

const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function DesktopTitleBar() {
  const [windowApi, setWindowApi] = useState<TauriWindowApi | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    let isMounted = true;

    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const currentWindow = getCurrentWindow();
      const maximized = await currentWindow.isMaximized();
      if (!isMounted) return;
      setWindowApi(currentWindow);
      setIsMaximized(maximized);
    }).catch((error) => {
      console.error("[DesktopTitleBar] Failed to load Tauri window API:", error);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isTauri()) {
    return null;
  }

  const handleMinimize = async () => {
    if (!windowApi) return;
    try {
      await windowApi.minimize();
    } catch (error) {
      console.error("[DesktopTitleBar] Minimize failed:", error);
    }
  };

  const handleToggleMaximize = async () => {
    if (!windowApi) return;

    try {
      if (isMaximized) {
        await windowApi.unmaximize();
        setIsMaximized(false);
        return;
      }

      await windowApi.maximize();
      setIsMaximized(true);
    } catch (error) {
      console.error("[DesktopTitleBar] Maximize toggle failed:", error);
    }
  };

  const handleClose = async () => {
    if (!windowApi) return;
    try {
      await windowApi.close();
    } catch (error) {
      console.error("[DesktopTitleBar] Close failed:", error);
    }
  };

  const handleControlClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="flex shrink-0 items-center justify-between border-b border-border/80 bg-sidebar/90 pl-2 text-foreground"
      data-testid="desktop-title-bar"
      style={{ height: `${APP_TITLE_BAR_HEIGHT}px` }}
      onDoubleClick={() => {
        void handleToggleMaximize();
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
        <div
          className="flex h-5 items-center gap-1.5 text-[12px] font-medium text-foreground/90"
          data-tauri-drag-region
        >
          <span className="h-2 w-2 rounded-full bg-primary" data-tauri-drag-region />
          <span data-tauri-drag-region>Vetra</span>
        </div>
        <div className="text-[11px] leading-none text-muted-foreground" data-tauri-drag-region>
          Desktop
        </div>
      </div>

      <div className="flex h-full items-stretch">
        <button
          type="button"
          aria-label="Minimize window"
          className="flex h-full w-11 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(event) => {
            handleControlClick(event);
            void handleMinimize();
          }}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
          className="flex h-full w-11 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(event) => {
            handleControlClick(event);
            void handleToggleMaximize();
          }}
        >
          {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Close window"
          className="flex h-full w-11 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground hover:bg-destructive/12 hover:text-destructive"
          onClick={(event) => {
            handleControlClick(event);
            void handleClose();
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
