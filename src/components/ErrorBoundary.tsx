import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { readError } from "../utils/format";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: unknown;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Render failed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-shell fatal-shell">
          <section className="fatal-error">
            <AlertTriangle size={30} />
            <h1>界面渲染失败</h1>
            <p>{readError(this.state.error)}</p>
            <button onClick={() => window.location.reload()}>
              <RefreshCw size={17} />
              重新加载
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
