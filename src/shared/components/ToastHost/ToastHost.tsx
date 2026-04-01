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
      className="fixed left-6 bottom-24 z-toast pointer-events-none"
      aria-live="polite"
    >
      <div className="max-w-[340px] bg-card border border-border p-4 pointer-events-auto">
        <div className="flex items-start gap-3">
          <div className="w-1 self-stretch bg-primary shrink-0" />
          <div className="flex flex-col gap-0.5">
            <div className="text-sm text-foreground">
              {toast.title}
            </div>
            {toast.body && (
              <div className="text-xs text-muted-foreground">
                {toast.body}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}