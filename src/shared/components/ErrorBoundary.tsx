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
        <div className="flex h-screen flex-col items-center justify-center bg-background p-8 text-destructive">
          <h2 className="text-xl font-bold tracking-tight">Oops, something broke in the interface 🤕</h2>
          <details className="mt-4 max-w-full overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
            {this.state.error?.toString()}
          </details>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
