import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext) {
  if (import.meta.env.PROD) {
    try {
      registerSW({
        immediate: true,
        onRegisterError() {
          // Ignore SW errors in restricted Android WebViews
        },
      });
    } catch {
      // Ignore SW initialization error
    }
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        for (const reg of regs) {
          reg.unregister().catch(() => {});
        }
      })
      .catch(() => {});
  }
}

interface ErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh bg-[#070709] text-[#F5F6F8] flex flex-col items-center justify-center p-6 text-center">
          <h1 className="font-display text-lg font-bold">No se pudo iniciar Picta Pulse</h1>
          <p className="mt-2 text-xs text-[#9CA3AF] max-w-sm break-words">
            {this.state.error.message || 'Error inesperado en el navegador.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 min-h-[44px] px-5 rounded-xl bg-[#FF4D4D] text-white text-sm font-semibold cursor-pointer"
          >
            Recargar aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
