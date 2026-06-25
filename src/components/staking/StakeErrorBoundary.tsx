import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logCyborgDiagnostic } from '@/lib/cyborgEngine';

interface Props {
  children: ReactNode;
  message?: string;
  fallback?: ReactNode;
  onRetry?: () => void | Promise<void>;
}

interface State {
  hasError: boolean;
  retryKey: number;
}

export class StakeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[StakeErrorBoundary]', error, info.componentStack);
    logCyborgDiagnostic('StakeErrorBoundary caught render error', {
      message: error.message,
      stack: error.stack,
    });
  }

  private handleRetry = () => {
    logCyborgDiagnostic('StakeErrorBoundary: user retry — full engine restart');
    void this.props.onRetry?.();
    this.setState(prev => ({
      hasError: false,
      retryKey: prev.retryKey + 1,
    }));
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
        <div className="glass-card p-4 border border-loss/40 bg-loss/5 text-sm text-loss space-y-2">
          <p>{this.props.message ?? 'Chyba pri načítaní dát.'}</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="text-[10px] text-violet-300 hover:text-violet-200 underline"
          >
            Skúsiť znova
          </button>
        </div>
      );
    }

    return (
      <div key={this.state.retryKey}>
        {this.props.children}
      </div>
    );
  }
}
