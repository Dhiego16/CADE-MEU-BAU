import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Em produção você poderia enviar para um serviço de monitoramento (ex: Sentry)
    console.error('[ErrorBoundary] Erro capturado:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-8 text-center">
        {/* Ícone */}
        <div className="w-24 h-24 bg-red-500/10 border border-red-500/30 rounded-[2rem] flex items-center justify-center mb-6">
          <span className="text-5xl">🚨</span>
        </div>

        {/* Título */}
        <div className="bg-yellow-400 text-black px-5 py-2 font-black italic text-xl skew-x-[-10deg] uppercase tracking-tighter mb-4">
          Algo deu errado!
        </div>

        {/* Descrição */}
        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-2 leading-relaxed max-w-xs">
          O app encontrou um erro inesperado.
        </p>
        <p className="text-slate-600 text-xs font-bold uppercase tracking-widest mb-8 leading-relaxed max-w-xs">
          Tente recarregar ou limpar o cache do app.
        </p>

        {/* Detalhes do erro em modo dev */}
        {isDev && this.state.error && (
          <div className="bg-red-950/50 border border-red-500/30 rounded-2xl p-4 mb-6 max-w-sm w-full text-left">
            <p className="text-red-400 text-[10px] font-black uppercase tracking-widest mb-2">
              Detalhes (apenas em dev):
            </p>
            <p className="text-red-300 text-[11px] font-mono break-all leading-relaxed">
              {this.state.error.message}
            </p>
          </div>
        )}

        {/* Botões */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={this.handleReload}
            className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-transform"
          >
            Recarregar app
          </button>
          <button
            onClick={this.handleReset}
            className="w-full border border-white/10 text-slate-400 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform"
          >
            Tentar continuar
          </button>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            className="w-full text-slate-600 text-[10px] font-black uppercase tracking-widest py-2 active:scale-95 transition-transform"
          >
            Limpar dados e recarregar
          </button>
        </div>

        {/* Rodapé */}
        <p className="mt-8 text-slate-700 text-[9px] font-black uppercase tracking-widest">
          Cadê meu Baú? — {new Date().getFullYear()}
        </p>
      </div>
    );
  }
}

export default ErrorBoundary;
