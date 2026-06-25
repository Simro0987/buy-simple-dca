import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  message?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class StakeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[StakeErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback === null) return null;

      if (this.props.fallback) {
        return (
          <div className="space-y-2">
            {this.props.fallback}
            <button
              type="button"
              onClick={this.handleRetry}
              className="text-[10px] text-violet-300 hover:text-violet-200 underline"
            >
              {this.props.message?.includes('Chyba') ? 'Skúsiť znova načítať HCD panel' : 'Retry HCD panel'}
            </button>
          </div>
        );
      }

      return (
        <div className="glass-card p-4 border border-loss/40 bg-loss/5 text-sm text-loss">
          {this.props.message ?? 'Chyba pri načítaní dát.'}
        </div>
      );
    }
    return this.props.children;
  }
}
