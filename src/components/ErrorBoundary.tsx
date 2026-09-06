import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Terjadi kesalahan tidak terduga',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Share Rich error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full p-6 rounded-3xl bg-white border border-pink-100 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight text-slate-900">
                Sesi Perlu Disegarkan
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Aplikasi mendeteksi interupsi koneksi atau antrian data. Anda dapat langsung melanjutkan dengan memuat ulang halaman.
              </p>
            </div>

            {this.state.errorMessage && (
              <div className="p-3 rounded-xl bg-pink-50 border border-pink-200 text-[11px] font-mono text-slate-500 text-left truncate">
                {this.state.errorMessage}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Coba Lagi
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-pink-500 hover:bg-pink-400 text-white text-xs font-bold shadow-lg shadow-pink-500/20 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang Halaman</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
