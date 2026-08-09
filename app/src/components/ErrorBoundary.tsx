import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level crash guard. Meg will mostly hit this one-handed, mid-scan, on her phone — a blank
 * white screen with no way forward is much worse there than on desktop, so this always offers a
 * way back to the library instead of just logging and giving up.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>The page hit an unexpected error. Your library data is safe — this is just a display glitch.</p>
          <div className="confirm-actions">
            <button
              className="btn btn--primary"
              onClick={() => {
                this.setState({ error: null });
                window.location.assign("/");
              }}
            >
              Back to Library
            </button>
            <button className="btn btn--ghost" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
