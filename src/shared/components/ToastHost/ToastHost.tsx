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
      style={{
        position: "fixed",
        left: 16,
        bottom: 76,
        zIndex: 99999,
        pointerEvents: "none",
      }}
      aria-live="polite"
    >
      <div
        style={{
          width: 320,
          background: "rgba(25, 27, 33, 0.92)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
          borderRadius: 10,
          padding: "12px 14px",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
          {toast.title}
        </div>
        {toast.body && (
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            {toast.body}
          </div>
        )}
      </div>
    </div>
  );
}

