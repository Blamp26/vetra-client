import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

type TauriWindowApi = {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  unmaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
};

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
      className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-sidebar px-3 text-foreground"
      data-testid="desktop-title-bar"
      onDoubleClick={() => {
        void handleToggleMaximize();
      }}
    >
      <div className="flex min-w-0 flex-1 items-center" data-tauri-drag-region>
        <div className="text-sm font-medium tracking-normal" data-tauri-drag-region>
          Vetra
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Minimize window"
          className="flex h-8 w-10 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(event) => {
            handleControlClick(event);
            void handleMinimize();
          }}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
          className="flex h-8 w-10 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
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
          className="flex h-8 w-10 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground hover:bg-red-100 hover:text-red-700"
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
