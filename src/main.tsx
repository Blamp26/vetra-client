import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./channel-panel.css";
import { useAppStore } from "@/store";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary"; // <-- ДОБАВЛЕНО
import { ensureNotificationPermission } from "@/services/notifications";

// Request notification permission on startup
ensureNotificationPermission().catch(console.error);

function ThemeInitializer() {
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary> {/* <-- ДОБАВЛЕНО */}
      <ThemeInitializer />
      <App />
    </ErrorBoundary> {/* <-- ДОБАВЛЕНО */}
  </React.StrictMode>
);
