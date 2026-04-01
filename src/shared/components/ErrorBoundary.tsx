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
          <h2 className="text-xl font-normal">Something went wrong</h2>
          <details className="mt-4 max-w-full overflow-auto whitespace-pre-wrap border border-border bg-muted p-4 text-xs text-muted-foreground">
            {this.state.error?.toString()}
          </details>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-primary text-primary-foreground text-sm border border-primary"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}