import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort catch for render-time exceptions. Without this, any uncaught
 * throw anywhere in the tree (a bad data shape, a null dereference) unmounts
 * the whole app to a white screen with no way back except a manual refresh.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-surface flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-danger/10">
            <AlertTriangle className="size-8 text-danger" />
          </div>
          <div>
            <p className="text-lg font-extrabold text-ink">Something went wrong</p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              PulseShop hit an unexpected error. Reloading usually fixes it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
