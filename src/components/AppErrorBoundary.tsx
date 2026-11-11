import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Globálny error boundary — zabráni čiernej/prázdnej obrazovke
 * pri neodchytenej výnimke v render fáze.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-5 space-y-3">
          <h1 className="text-base font-semibold">Aplikáciu sa nepodarilo vykresliť</h1>
          <p className="text-sm text-muted-foreground">
            Nastala neočakávaná chyba. Skús obnoviť stránku — ak problém pretrvá, dáta z backendu môžu byť
            momentálne nedostupné.
          </p>
          <pre className="text-[11px] whitespace-pre-wrap break-words text-muted-foreground/80 max-h-40 overflow-auto">
            {error.message}
          </pre>
          <button
            className="w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2"
            onClick={() => window.location.reload()}
          >
            Obnoviť aplikáciu
          </button>
        </div>
      </div>
    );
  }
}
