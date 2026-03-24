import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "var(--error, red)", background: "var(--bg-primary, #111)", height: "100vh" }}>
          <h2>Упс, что-то сломалось в интерфейсе 🤕</h2>
          <details style={{ whiteSpace: "pre-wrap", marginTop: "10px", color: "var(--text-secondary, #ccc)" }}>
            {this.state.error?.toString()}
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: "20px", padding: "8px 16px", cursor: "pointer" }}
          >
            Перезагрузить приложение
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
