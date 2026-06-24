import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  message?: string;
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

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-card p-4 border border-loss/40 bg-loss/5 text-sm text-loss">
          {this.props.message ?? 'Chyba pri načítaní dát.'}
        </div>
      );
    }
    return this.props.children;
  }
}
