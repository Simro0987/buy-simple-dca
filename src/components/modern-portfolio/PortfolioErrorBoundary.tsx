import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Settings } from 'lucide-react';

interface Props {
  children: ReactNode;
  sk?: boolean;
  onEditHoldings?: () => void;
}

interface State {
  hasError: boolean;
}

export class PortfolioErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Portfolio] render error', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const sk = this.props.sk;
      return (
        <div className="min-w-0 rounded-3xl border border-white/10 bg-[#0A0A0A] p-6 sm:p-8 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">
            {sk ? 'Portfólio' : 'Portfolio'}
          </p>
          <h2 className="text-xl font-semibold text-white">
            {sk ? 'Zobrazenie portfólia sa obnovuje' : 'Restoring portfolio view'}
          </h2>
          <p className="text-sm text-white/50 leading-relaxed">
            {sk
              ? 'Údaje sú v bezpečnom nulovom stave. Môžete pokračovať úpravou držieb.'
              : 'Your data is in a safe zero state. You can continue by editing holdings.'}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => this.props.onEditHoldings?.()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#14F195] text-black text-sm font-semibold"
            >
              <Settings className="w-4 h-4" />
              {sk ? 'Upraviť držby' : 'Edit holdings'}
            </button>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2.5 rounded-xl border border-white/15 text-white/70 text-sm hover:text-white"
            >
              {sk ? 'Skúsiť znova' : 'Try again'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
