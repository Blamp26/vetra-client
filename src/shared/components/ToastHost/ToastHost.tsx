import { useEffect, useState } from "react";

type ToastPayload = {
  title: string;
  body?: string;
  durationMs?: number;
};

type ToastState = ToastPayload & { id: number };

export function ToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let t: number | undefined;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<ToastPayload>;
      const payload = ce.detail;
      if (!payload?.title) return;

      const next: ToastState = {
        id: Date.now(),
        title: payload.title,
        body: payload.body,
        durationMs: payload.durationMs ?? 4000,
      };
      setToast(next);

      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => setToast((cur) => (cur?.id === next.id ? null : cur)), next.durationMs);
    };

    window.addEventListener("vetra:toast", handler as EventListener);
    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener("vetra:toast", handler as EventListener);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      className="fixed left-4 bottom-[76px] z-[99999] pointer-events-none"
      aria-live="polite"
    >
      <div
        className="w-[320px] bg-popover/95 border border-border shadow-xl rounded-lg p-3 backdrop-blur-md pointer-events-auto"
      >
        <div className="font-bold text-xs text-popover-foreground">
          {toast.title}
        </div>
        {toast.body && (
          <div className="mt-1 text-2xs text-popover-foreground/70 leading-normal">
            {toast.body}
          </div>
        )}
      </div>
    </div>
  );
}

