/**
 * PortfolioPage — vstupný bod sekcie Portfólio.
 * Renderuje ModernPortfolioPage (Web3 Bento Grid).
 */
import { Component, type ReactNode } from 'react';
import { ModernPortfolioPage } from '@/pages/ModernPortfolioPage';
import { Lang } from '@/lib/i18n';
import { Bento, Label } from '@/components/deep-space/primitives';

interface Props {
  lang: Lang;
}

class PortfolioErrorBoundary extends Component<{ children: ReactNode; lang: Lang }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const sk = this.props.lang === 'sk';
      return (
        <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
          <Bento className="p-6 max-w-md w-full space-y-3">
            <Label>{sk ? 'Chyba portfólia' : 'Portfolio error'}</Label>
            <p className="text-sm text-white/60 font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="text-xs font-mono text-[#14F195] hover:underline"
            >
              {sk ? 'Skúsiť znova' : 'Try again'}
            </button>
          </Bento>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PortfolioPage({ lang }: Props) {
  return (
    <div className="min-h-screen w-full flex flex-col">
      <PortfolioErrorBoundary lang={lang}>
        <ModernPortfolioPage lang={lang} />
      </PortfolioErrorBoundary>
    </div>
  );
}

/** @deprecated alias */
export { PortfolioPage as default };
