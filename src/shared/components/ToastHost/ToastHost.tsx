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
      className="fixed left-6 bottom-24 z-[99999] pointer-events-none"
      aria-live="polite"
    >
      <div
        className="max-w-[340px] bg-card/60 backdrop-blur-3xl border border-white/10 dark:border-white/5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.3)] rounded-[1.5rem] p-4 px-5 pointer-events-auto ring-1 ring-inset ring-white/10 animate-in slide-in-from-bottom-8 fade-in duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
      >
        <div className="flex items-start gap-3">
          <div className="w-1.5 h-6 rounded-full bg-primary mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <div className="font-extrabold text-[0.9rem] text-foreground tracking-tight leading-tight">
              {toast.title}
            </div>
            {toast.body && (
              <div className="text-[0.8rem] font-medium text-muted-foreground/80 leading-snug">
                {toast.body}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

